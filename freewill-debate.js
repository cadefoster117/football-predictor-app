// ══════════════════════════════════════════
//  AivsBookie — freewill-debate.js
//  Team Free Will: 3 AI debate per game
//  Input: real BSD games from freewill-engine
//  DeepSeek (Analyst) + GPT (Advocate) +
//  DeepSeek (Skeptic) — majority vote
// ══════════════════════════════════════════

require("dotenv").config()

const fs = require("fs")
const { callLLM } = require("./llm-helper")

// ── Personas ──────────────────────────────

const PERSONAS = {
  analyst: {
    name: "The Analyst", icon: "📊", color: "blue", model: "deepseek",
    system: `You are a cold football statistics analyst. You only trust numbers and model outputs.
Assess ONLY the Over 2.5 Goals + BTTS bet for the match provided.
The match data is REAL — from a live sports API. Do not question or replace it.
Respond ONLY with valid JSON:
{"vote":"YES" or "NO","confidence":0-100,"reason":"one sentence","key_signal":"most important number"}`
  },
  advocate: {
    name: "The Advocate", icon: "🟢", color: "green", model: "gpt",
    system: `You are a football betting advocate. Make the strongest case FOR betting Over 2.5 Goals + BTTS.
The match data is REAL — from a live sports API. Use only the data provided, do not invent details.
Respond ONLY with valid JSON:
{"vote":"YES" or "NO","confidence":0-100,"reason":"one sentence","key_signal":"strongest positive signal"}`
  },
  skeptic: {
    name: "The Skeptic", icon: "🔴", color: "red", model: "deepseek",
    system: `You are a football betting skeptic. Find every reason the Over 2.5 Goals + BTTS bet will FAIL.
The match data is REAL — from a live sports API. Only use the provided data.
If you find a fatal flaw, label it: "FATAL FLAW: [reason]"
Respond ONLY with valid JSON:
{"vote":"YES" or "NO","confidence":0-100,"reason":"one sentence","key_signal":"biggest red flag or N/A"}`
  }
}

// ── Game brief using only real BSD data ───

function gameBrief(game) {
  const m = game.models
  const xgTotal = ((game.expected_home_goals ?? 0) + (game.expected_away_goals ?? 0)).toFixed(2)

  return `REAL MATCH FROM BSD SPORTS API:
Match:  ${game.match}
League: ${game.league}
Date:   ${game.date} ${game.time}

PROBABILITY DATA (from ML model):
  Over 1.5 Goals: ${(game.prob_over_15 ?? 0).toFixed(1)}%
  Over 2.5 Goals: ${(game.prob_over_25 ?? 0).toFixed(1)}%
  Over 3.5 Goals: ${(game.prob_over_35 ?? 0).toFixed(1)}%
  BTTS Yes:       ${(game.prob_btts_yes ?? 0).toFixed(1)}%
  Home Win:       ${(game.prob_home_win ?? 0).toFixed(1)}%
  Draw:           ${(game.prob_draw ?? 0).toFixed(1)}%
  Away Win:       ${(game.prob_away_win ?? 0).toFixed(1)}%

EXPECTED GOALS:
  Home xG: ${(game.expected_home_goals ?? 0).toFixed(2)}
  Away xG: ${(game.expected_away_goals ?? 0).toFixed(2)}
  Total:   ${xgTotal}

MODEL SIGNALS:
  Predicted result:    ${game.predicted_result ?? "N/A"}
  Most likely score:   ${game.most_likely_score ?? "N/A"}
  Model confidence:    ${game.confidence != null ? (game.confidence * 100).toFixed(0) + "%" : "N/A"}
  Favorite win prob:   ${game.favorite_prob?.toFixed(1) ?? "N/A"}%
  BSD recommends BTTS: ${game.btts_recommend ? "YES" : "NO"}
  BSD recommends O2.5: ${game.over_25_recommend ? "YES" : "NO"}

OUR ML ENSEMBLE (XGBoost + LightGBM + CatBoost):
  XGBoost:  ${(m.xgboost.score * 100).toFixed(1)}% (${m.xgboost.label})
  LightGBM: ${(m.lightgbm.score * 100).toFixed(1)}% (${m.lightgbm.label})
  CatBoost: ${(m.catboost.score * 100).toFixed(1)}% (${m.catboost.label})
  Ensemble: ${(m.ensemble * 100).toFixed(1)}% | Votes: ${m.votes}/3`
}

// ── Debate one game ───────────────────────

async function debateGame(game) {
  const brief      = gameBrief(game)
  const userPrompt = `Analyze this REAL match for Over 2.5 Goals + BTTS:\n\n${brief}`

  console.log(`  ⚡ ${game.match}`)

  const votes = {}

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
  console.log("║  Real BSD games · DeepSeek + GPT     ║")
  console.log("╚══════════════════════════════════════╝\n")

  let top10 = []
  try {
    const raw = JSON.parse(fs.readFileSync("public/freewill-predictions.json"))
    top10 = raw.top10 || []
  } catch {
    console.error("❌ freewill-predictions.json not found — run freewill-engine.js first")
    process.exit(1)
  }

  if (top10.length === 0) {
    console.log("⚠ No games to debate")
    fs.writeFileSync("public/freewill-debate.json", JSON.stringify({
      last_scan: new Date().toISOString(), games_debated: 0, passed: 0, results: []
    }, null, 2))
    return
  }

  console.log(`📋 Debating ${top10.length} real BSD games...\n`)

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

  console.log(`\n✅ Done — ${passed.length}/${results.length} games passed\n`)
}

run()
