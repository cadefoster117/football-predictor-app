// ══════════════════════════════════════════
//  AivsBookie — freewill-debate.js
//  Team Free Will: 3 AI debate per game
//  DeepSeek (x2 roles) + GPT-4o-mini
//  Avoids Gemini — unreliable on this API
// ══════════════════════════════════════════

require("dotenv").config()

const fs = require("fs")
const { callLLM } = require("./llm-helper")

// ── Personas ──────────────────────────────
// deepseek  → The Analyst (data-driven)
// gpt       → The Advocate (argues YES)
// deepseek  → The Skeptic (argues NO)
// Judge verdict: majority of the 3 votes

const PERSONAS = {
  analyst: {
    name:  "The Analyst",
    icon:  "📊",
    color: "blue",
    model: "deepseek",
    system: `You are a cold football statistics analyst. You only trust numbers.
Assess the Over 2.5 Goals + BTTS bet based purely on probability data, xG values, and model outputs.
Respond ONLY with valid JSON:
{"vote":"YES" or "NO","confidence":0-100,"reason":"one sentence","key_signal":"most important number"}`
  },
  advocate: {
    name:  "The Advocate",
    icon:  "🟢",
    color: "green",
    model: "gpt",
    system: `You are a football betting advocate. Make the strongest case FOR betting Over 2.5 Goals + BTTS.
Find every positive signal. Be persuasive but only use the data provided.
Respond ONLY with valid JSON:
{"vote":"YES" or "NO","confidence":0-100,"reason":"one sentence","key_signal":"strongest positive signal"}`
  },
  skeptic: {
    name:  "The Skeptic",
    icon:  "🔴",
    color: "red",
    model: "deepseek",
    system: `You are a football betting skeptic. Find every reason the Over 2.5 Goals + BTTS bet will FAIL.
Look for: clean sheet risk, heavy favourite, weak xG, low confidence, misaligned market.
If you find a fatal flaw label it: "FATAL FLAW: [reason]"
Respond ONLY with valid JSON:
{"vote":"YES" or "NO","confidence":0-100,"reason":"one sentence","key_signal":"biggest red flag or N/A"}`
  }
}

// ── Game brief ────────────────────────────

function gameBrief(game) {
  const m = game.models
  return `MATCH: ${game.match}
LEAGUE: ${game.league}
KICKOFF: ${game.date} ${game.time}

PROBABILITIES:
  Over 1.5: ${(game.prob_over_15 ?? 0).toFixed(1)}%
  Over 2.5: ${(game.prob_over_25 ?? 0).toFixed(1)}%
  Over 3.5: ${(game.prob_over_35 ?? 0).toFixed(1)}%
  BTTS:     ${(game.prob_btts_yes ?? 0).toFixed(1)}%
  Home Win: ${(game.prob_home_win ?? 0).toFixed(1)}%
  Draw:     ${(game.prob_draw ?? 0).toFixed(1)}%
  Away Win: ${(game.prob_away_win ?? 0).toFixed(1)}%

EXPECTED GOALS:
  Home xG: ${game.expected_home_goals?.toFixed(2) ?? "N/A"}
  Away xG: ${game.expected_away_goals?.toFixed(2) ?? "N/A"}
  Total:   ${((game.expected_home_goals ?? 0) + (game.expected_away_goals ?? 0)).toFixed(2)}

MODEL SIGNALS:
  Predicted result:    ${game.predicted_result ?? "N/A"}
  Most likely score:   ${game.most_likely_score ?? "N/A"}
  Model confidence:    ${game.confidence != null ? (game.confidence * 100).toFixed(0) + "%" : "N/A"}
  Favorite win prob:   ${game.favorite_prob?.toFixed(1) ?? "N/A"}%
  BSD recommends BTTS: ${game.btts_recommend ? "YES" : "NO"}
  BSD recommends O2.5: ${game.over_25_recommend ? "YES" : "NO"}

ML ENSEMBLE (XGBoost + LightGBM + CatBoost):
  XGBoost:  ${(m.xgboost.score * 100).toFixed(1)}% (${m.xgboost.label})
  LightGBM: ${(m.lightgbm.score * 100).toFixed(1)}% (${m.lightgbm.label})
  CatBoost: ${(m.catboost.score * 100).toFixed(1)}% (${m.catboost.label})
  Ensemble: ${(m.ensemble * 100).toFixed(1)}% | Votes: ${m.votes}/3`
}

// ── Debate one game ───────────────────────

async function debateGame(game) {
  const brief = gameBrief(game)
  const userPrompt = `Analyze this match for Over 2.5 Goals + BTTS:\n\n${brief}`

  console.log(`  ⚡ ${game.match}`)

  const votes = {}

  // Run all 3 in parallel
  await Promise.all(
    Object.entries(PERSONAS).map(async ([key, persona]) => {
      try {
        const result = await callLLM(persona.model, persona.system, userPrompt)
        votes[key] = {
          name:       persona.name,
          icon:       persona.icon,
          color:      persona.color,
          vote:       result.vote === "YES" ? "YES" : "NO",
          confidence: Math.min(100, Math.max(0, parseInt(result.confidence) || 0)),
          reason:     result.reason     || "No reason provided",
          key_signal: result.key_signal || "N/A"
        }
        process.stdout.write(`    ${persona.icon} ${persona.name}: ${votes[key].vote} (${votes[key].confidence}%)  `)
      } catch (err) {
        console.error(`\n    ✗ ${persona.name} failed:`, err.message)
        votes[key] = {
          name: persona.name, icon: persona.icon, color: persona.color,
          vote: "ERROR", confidence: 0,
          reason: `Failed: ${err.message}`, key_signal: "N/A"
        }
      }
    })
  )

  console.log()

  // Consensus: count valid YES votes
  const valid    = Object.values(votes).filter(v => v.vote !== "ERROR")
  const yesCount = valid.filter(v => v.vote === "YES").length
  const total    = valid.length || 1
  const avgConf  = Math.round(valid.reduce((s, v) => s + v.confidence, 0) / total)
  const passed   = yesCount >= 2

  const strength = yesCount === 3 ? "STRONG"
                 : yesCount === 2 ? "MODERATE"
                 : yesCount === 1 ? "WEAK" : "NONE"

  console.log(`    → ${yesCount}/${total} YES | ${strength} | avg ${avgConf}%`)

  return {
    ...game,
    debate: {
      passed,
      yes_count:      yesCount,
      total_votes:    total,
      avg_confidence: avgConf,
      strength,
      votes,
      summary: `${yesCount}/${total} AIs recommend Over 2.5 + BTTS — ${strength} consensus at ${avgConf}% avg confidence`
    }
  }
}

// ── Main ──────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════════════╗")
  console.log("║  Team Free Will — AI Debate Engine   ║")
  console.log("║  DeepSeek · GPT-4o · DeepSeek       ║")
  console.log("╚══════════════════════════════════════╝\n")

  let top10 = []
  try {
    const raw = JSON.parse(fs.readFileSync("public/freewill-predictions.json"))
    top10 = raw.top10 || []
  } catch {
    console.error("❌ public/freewill-predictions.json not found — run freewill-engine.js first")
    process.exit(1)
  }

  if (top10.length === 0) {
    console.log("⚠ No games to debate")
    fs.writeFileSync("public/freewill-debate.json", JSON.stringify({
      last_scan: new Date().toISOString(), games_debated: 0, passed: 0, results: []
    }, null, 2))
    return
  }

  console.log(`📋 Debating ${top10.length} games...\n`)

  const results = []
  for (const game of top10) {
    const r = await debateGame(game)
    results.push(r)
    await new Promise(r => setTimeout(r, 400))
  }

  results.sort((a, b) => {
    if (a.debate.passed !== b.debate.passed) return b.debate.passed - a.debate.passed
    if (a.debate.yes_count !== b.debate.yes_count) return b.debate.yes_count - a.debate.yes_count
    return b.debate.avg_confidence - a.debate.avg_confidence
  })

  const passed = results.filter(r => r.debate.passed)

  fs.writeFileSync("public/freewill-debate.json", JSON.stringify({
    last_scan:     new Date().toISOString(),
    games_debated: results.length,
    passed:        passed.length,
    results
  }, null, 2))

  console.log(`\n✅ Done — ${passed.length}/${results.length} passed\n`)
}

run()
