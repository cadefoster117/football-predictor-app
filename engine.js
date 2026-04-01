const fs = require("fs")
const axios = require("axios")

const BSD_API = "https://sports.bzzoiro.com/api/predictions/?upcoming=true"
const BSD_TOKEN = "c856e7f4def835bb1b2e448e6ccda8b47ed188ac"
const ANTHROPIC_KEY = "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"

// ─── BSD: fetch all pages ───────────────────────────────────────────

async function fetchAllPages() {
  const all = []
  let url = BSD_API
  while (url) {
    const res = await axios.get(url, {
      headers: { Authorization: `Token ${BSD_TOKEN}` }
    })
    all.push(...(res.data.results || []))
    url = res.data.next || null
  }
  return all
}

// ─── CLAUDE: single analyst vote ────────────────────────────────────

async function analystVote(prediction, persona) {

  const personas = {
    stats: `You are a cold, data-driven football statistics analyst. 
You only trust probability numbers. You are strict — you only say YES if both 
prob_over_25 and prob_btts_yes are statistically strong together.`,

    form: `You are a football form and context analyst. 
You consider the league, teams, and match dynamics. You think about whether 
this type of fixture typically produces goals and if both teams are likely to score.`,

    value: `You are a football betting value analyst. 
You assess whether the Over 2.5 & BTTS combination is genuinely worth backing 
or if the combo probability is inflated. You are skeptical and conservative.`
  }

  const prompt = `
Analyse this football prediction and decide if Over 2.5 & BTTS is a GOOD BET.

Match: ${prediction.match}
League: ${prediction.league}
Kickoff: ${prediction.date} ${prediction.time}

Probabilities from ML model:
- Over 2.5: ${(prediction.probability.over25 * 100).toFixed(1)}%
- BTTS: ${(prediction.probability.btts * 100).toFixed(1)}%
- Combined score: ${(prediction.probability.combo * 100).toFixed(1)}%

Extra model data:
- Predicted result: ${prediction.predicted_result || "N/A"}
- Most likely score: ${prediction.most_likely_score || "N/A"}
- Expected goals home: ${prediction.xg_home || "N/A"}
- Expected goals away: ${prediction.xg_away || "N/A"}
- Model confidence: ${prediction.confidence || "N/A"}

Respond in this exact JSON format only, no extra text:
{
  "vote": "YES" or "NO",
  "reason": "one sentence explanation"
}
`

  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: personas[persona],
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      }
    }
  )

  const text = res.data.content[0].text.trim()
  const clean = text.replace(/```json|```/g, "").trim()
  return JSON.parse(clean)
}

// ─── CLAUDE: all 3 analysts vote on one prediction ──────────────────

async function runEnsemble(prediction) {
  const [stats, form, value] = await Promise.all([
    analystVote(prediction, "stats"),
    analystVote(prediction, "form"),
    analystVote(prediction, "value")
  ])

  const allAgree =
    stats.vote === "YES" &&
    form.vote  === "YES" &&
    value.vote === "YES"

  return {
    ...prediction,
    ai: {
      consensus: allAgree,
      votes: {
        statistics: stats,
        form:        form,
        value:       value
      }
    }
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────

async function run() {
  try {
    console.log("Fetching games from BSD...")
    const data = await fetchAllPages()

    const now     = new Date()
    const next24  = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Build candidates (top 20 by combo score)
    const candidates = []

    for (const p of data) {
      const over  = (p.prob_over_25 || 0) / 100
      const btts  = (p.prob_btts_yes || 0) / 100
      const combo = over * btts

      const kickoff = p.event?.event_date ? new Date(p.event.event_date) : null
      if (!kickoff || kickoff < now || kickoff > next24) continue

      candidates.push({
        league:           p.event?.league?.name || "Unknown",
        match:            p.event?.home_team + " vs " + p.event?.away_team,
        date:             kickoff.toLocaleDateString(),
        time:             kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        predicted_result: p.predicted_result,
        most_likely_score:p.most_likely_score,
        xg_home:          p.expected_home_goals,
        xg_away:          p.expected_away_goals,
        confidence:       p.confidence,
        probability:      { over25: over, btts: btts, combo: combo },
        score:            combo
      })
    }

    candidates.sort((a, b) => b.score - a.score)
    const top20 = candidates.slice(0, 20)

    console.log(`Running AI ensemble on ${top20.length} candidates...`)

    // Run ensemble on all candidates (3 API calls each, in parallel per game)
    const results = await Promise.all(top20.map(runEnsemble))

    // Only keep games ALL 3 analysts agreed on
    const confirmed = results.filter(r => r.ai.consensus)

    const output = {
      last_scan:      new Date().toISOString(),
      games_scanned:  data.length,
      candidates:     top20.length,
      ai_confirmed:   confirmed.length,
      predictions:    confirmed
    }

    fs.writeFileSync("predictions.json", JSON.stringify(output, null, 2))

    console.log("Done!")
    console.log("Games scanned:  ", data.length)
    console.log("Candidates:     ", top20.length)
    console.log("AI confirmed:   ", confirmed.length)

  } catch (e) {
    console.error("Engine error:", e.message)
  }
}

run()
