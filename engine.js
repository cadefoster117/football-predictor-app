// ══════════════════════════════════════════
//  AivsBookie — engine.js
//  Run: node engine.js
//
//  1. Fetches ALL today's games from BSD API (paginated)
//  2. Scores each by Over2.5 × BTTS combo
//  3. Sends top 20 candidates to Claude with 3
//     different analyst personas (ensemble)
//  4. Only keeps picks where ALL 3 vote YES
//  5. Saves to predictions.json
// ══════════════════════════════════════════

const fs    = require("fs")
const axios = require("axios")

const BSD_API   = "https://sports.bzzoiro.com/api/predictions/?upcoming=true"
const BSD_TOKEN = "c856e7f4def835bb1b2e448e6ccda8b47ed188ac"

const ANTHROPIC_KEY = "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"
const CLAUDE_MODEL  = "claude-sonnet-4-20250514"

// ── Analyst personas ──────────────────────

const PERSONAS = {
  statistics: {
    name: "Statistics Analyst",
    system: `You are a cold, data-driven football statistics analyst.
You only trust probability numbers from ML models.
You are strict — you say YES only if both prob_over_25 and prob_btts_yes
are individually strong AND their combined score is high.
If either number is weak, you vote NO. No exceptions.`
  },

  form: {
    name: "Form & Context Analyst",
    system: `You are a football form and match-context analyst.
You think about whether this league and fixture type typically produces
high-scoring, open games where both teams attack.
You consider team dynamics, fixture importance, and whether the match
setup favours goals. You use the expected goals data as your key signal.`
  },

  value: {
    name: "Value & Risk Analyst",
    system: `You are a football betting value and risk analyst.
You are the most skeptical of the three analysts.
You assess whether the Over 2.5 & BTTS combination is genuinely worth
backing or if there are red flags — one defensive team, low xG for either
side, or an inflated combo probability.
You reject borderline picks. Only strong setups get a YES from you.`
  }
}

// ── BSD: fetch all pages ──────────────────

async function fetchAllPages() {
  const all = []
  let url   = BSD_API
  let page  = 1

  while (url) {
    console.log(`  Fetching page ${page}...`)
    const res = await axios.get(url, {
      headers: { Authorization: `Token ${BSD_TOKEN}` }
    })
    const body = res.data
    all.push(...(body.results || []))
    url = body.next || null
    page++
  }

  return all
}

// ── Claude: single analyst vote ───────────

async function analystVote(prediction, personaKey) {
  const persona = PERSONAS[personaKey]

  const prompt = `
Analyse this football match and decide if Over 2.5 & BTTS is a GOOD BET.

Match:   ${prediction.match}
League:  ${prediction.league}
Kickoff: ${prediction.date} ${prediction.time}

ML Model Probabilities:
  Over 2.5 probability : ${(prediction.probability.over25 * 100).toFixed(1)}%
  BTTS probability     : ${(prediction.probability.btts * 100).toFixed(1)}%
  Combined score       : ${(prediction.probability.combo * 100).toFixed(1)}%

Additional Model Data:
  Predicted result     : ${prediction.predicted_result || "N/A"}
  Most likely score    : ${prediction.most_likely_score || "N/A"}
  Expected goals (home): ${prediction.xg_home ?? "N/A"}
  Expected goals (away): ${prediction.xg_away ?? "N/A"}
  Model confidence     : ${prediction.confidence != null ? (prediction.confidence * 100).toFixed(0) + "%" : "N/A"}

You must respond ONLY with valid JSON — no preamble, no markdown, no explanation outside the JSON.
Format:
{
  "vote": "YES" or "NO",
  "reason": "one concise sentence explaining your decision"
}
`

  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model:      CLAUDE_MODEL,
      max_tokens: 120,
      system:     persona.system,
      messages:   [{ role: "user", content: prompt }]
    },
    {
      headers: {
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json"
      }
    }
  )

  const text  = res.data.content[0].text.trim()
  const clean = text.replace(/```json|```/g, "").trim()

  try {
    return JSON.parse(clean)
  } catch {
    // Fallback if Claude returns slightly malformed JSON
    const voteMatch   = clean.match(/"vote"\s*:\s*"(YES|NO)"/i)
    const reasonMatch = clean.match(/"reason"\s*:\s*"([^"]+)"/)
    return {
      vote:   voteMatch   ? voteMatch[1].toUpperCase()   : "NO",
      reason: reasonMatch ? reasonMatch[1] : "Parse error — defaulting to NO"
    }
  }
}

// ── Claude: run all 3 analysts in parallel ─

async function runEnsemble(prediction) {
  console.log(`  🔍 Analysing: ${prediction.match}`)

  const [stats, form, value] = await Promise.all([
    analystVote(prediction, "statistics"),
    analystVote(prediction, "form"),
    analystVote(prediction, "value")
  ])

  const consensus =
    stats.vote === "YES" &&
    form.vote  === "YES" &&
    value.vote === "YES"

  const icon = consensus ? "✅" : "❌"
  console.log(`    ${icon} Stats: ${stats.vote} | Form: ${form.vote} | Value: ${value.vote}`)

  return {
    ...prediction,
    ai: {
      consensus,
      votes: {
        statistics: stats,
        form:       form,
        value:      value
      }
    }
  }
}

// ── Main ──────────────────────────────────

async function run() {
  console.log("\n═══════════════════════════════")
  console.log("  AivsBookie Engine")
  console.log("═══════════════════════════════\n")

  try {
    // 1. Fetch all games
    console.log("📡 Fetching games from BSD API...")
    const raw = await fetchAllPages()
    console.log(`   ${raw.length} total predictions fetched\n`)

    // 2. Filter to next 24 hours and score
    const now    = new Date()
    const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const candidates = []

    for (const p of raw) {
      const over  = (p.prob_over_25  || 0) / 100
      const btts  = (p.prob_btts_yes || 0) / 100
      const combo = over * btts

      const kickoff = p.event?.event_date ? new Date(p.event.event_date) : null
      if (!kickoff || kickoff < now || kickoff > next24) continue

      candidates.push({
        league:            p.event?.league?.name || "Unknown",
        match:             `${p.event?.home_team} vs ${p.event?.away_team}`,
        date:              kickoff.toLocaleDateString(),
        time:              kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        predicted_result:  p.predicted_result   || null,
        most_likely_score: p.most_likely_score  || null,
        xg_home:           p.expected_home_goals ?? null,
        xg_away:           p.expected_away_goals ?? null,
        confidence:        p.confidence          ?? null,
        probability:       { over25: over, btts, combo },
        score:             combo
      })
    }

    // Sort by combo score, take top 20 as candidates
    candidates.sort((a, b) => b.score - a.score)
    const top20 = candidates.slice(0, 20)

    console.log(`🎯 ${candidates.length} games in next 24h → top ${top20.length} going to AI\n`)
    console.log("🤖 Running AI ensemble (3 analysts per game)...\n")

    // 3. Run ensemble on all candidates
    const results = []
    for (const c of top20) {
      const r = await runEnsemble(c)
      results.push(r)
      // Small delay to be kind to the API
      await new Promise(res => setTimeout(res, 300))
    }

    const confirmed = results.filter(r => r.ai.consensus)

    // 4. Write predictions.json
    const output = {
      last_scan:     new Date().toISOString(),
      games_scanned: raw.length,
      candidates:    top20.length,
      ai_confirmed:  confirmed.length,
      predictions:   results  // All results (confirmed + rejected) so frontend can show both
    }

    fs.writeFileSync(
      "public/predictions.json",
      JSON.stringify(output, null, 2)
    )

    console.log("\n═══════════════════════════════")
    console.log(`  ✅ Done!`)
    console.log(`  Games scanned  : ${raw.length}`)
    console.log(`  Candidates     : ${top20.length}`)
    console.log(`  AI confirmed   : ${confirmed.length}`)
    console.log("═══════════════════════════════\n")

  } catch (err) {
    console.error("\n❌ Engine error:", err.message)
    if (err.response?.data) {
      console.error("   API response:", JSON.stringify(err.response.data, null, 2))
    }
    process.exit(1)
  }
}

run()
