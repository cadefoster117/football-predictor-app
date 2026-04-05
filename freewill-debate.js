// ══════════════════════════════════════════
//  AivsBookie — freewill-debate.js
//  Team Free Will: 3 AI debate per game
//  Gemini + DeepSeek + GPT via llmapi.ai
//  Combined with XGBoost+LightGBM+CatBoost
// ══════════════════════════════════════════

require("dotenv").config()

const fs = require("fs")
const { callLLM } = require("./llm-helper")

// ── System prompt (same for all 3 AIs) ───
// Each AI plays a different persona via
// the user prompt framing, not system prompt.
// This gives cleaner JSON output.

const SYSTEM_PROMPT = `You are an expert football betting analyst. 
Analyze the provided match data and give your assessment of the Over 2.5 Goals + BTTS bet.
You MUST respond ONLY with a valid JSON object in this exact format:
{
  "vote": "YES" or "NO",
  "confidence": number between 0 and 100,
  "reason": "one clear sentence explaining your decision",
  "key_signal": "the single most important data point in your decision"
}
No extra text. No markdown. Only the JSON object.`

// ── AI Personas ───────────────────────────

const PERSONAS = {
  gemini: {
    name:  "Gemini",
    icon:  "♊",
    color: "blue",
    model: "gemini",
    role:  "You are a statistical probability expert. Focus purely on the numerical model outputs and probability signals."
  },
  deepseek: {
    name:  "DeepSeek",
    icon:  "🔍",
    color: "green",
    model: "deepseek",
    role:  "You are a football tactics and market analyst. Focus on xG values, team attacking balance, and market movement signals."
  },
  gpt: {
    name:  "GPT-4o",
    icon:  "🤖",
    color: "amber",
    model: "gpt",
    role:  "You are a value betting specialist. Focus on risk assessment, red flags, and whether the odds offer genuine value."
  }
}

// ── Build game brief ──────────────────────

function gameBrief(game) {
  const m = game.models
  return `
MATCH: ${game.match}
LEAGUE: ${game.league}
KICKOFF: ${game.date} ${game.time}

PROBABILITY DATA:
  Over 1.5 Goals: ${(game.prob_over_15 ?? 0).toFixed(1)}%
  Over 2.5 Goals: ${(game.prob_over_25 ?? 0).toFixed(1)}%
  Over 3.5 Goals: ${(game.prob_over_35 ?? 0).toFixed(1)}%
  BTTS (Yes):     ${(game.prob_btts_yes ?? 0).toFixed(1)}%
  Home Win:       ${(game.prob_home_win ?? 0).toFixed(1)}%
  Draw:           ${(game.prob_draw ?? 0).toFixed(1)}%
  Away Win:       ${(game.prob_away_win ?? 0).toFixed(1)}%

EXPECTED GOALS:
  Home xG: ${game.expected_home_goals?.toFixed(2) ?? "N/A"}
  Away xG: ${game.expected_away_goals?.toFixed(2) ?? "N/A"}
  Total xG: ${((game.expected_home_goals ?? 0) + (game.expected_away_goals ?? 0)).toFixed(2)}

MODEL SIGNALS:
  Predicted result:   ${game.predicted_result ?? "N/A"}
  Most likely score:  ${game.most_likely_score ?? "N/A"}
  Model confidence:   ${game.confidence != null ? (game.confidence * 100).toFixed(0) + "%" : "N/A"}
  Favorite win prob:  ${game.favorite_prob?.toFixed(1) ?? "N/A"}%
  BSD recommends BTTS:    ${game.btts_recommend ? "YES" : "NO"}
  BSD recommends Over2.5: ${game.over_25_recommend ? "YES" : "NO"}

OUR ML ENSEMBLE (XGBoost + LightGBM + CatBoost):
  XGBoost:  ${(m.xgboost.score * 100).toFixed(1)}% — ${m.xgboost.label}
  LightGBM: ${(m.lightgbm.score * 100).toFixed(1)}% — ${m.lightgbm.label}
  CatBoost: ${(m.catboost.score * 100).toFixed(1)}% — ${m.catboost.label}
  Ensemble: ${(m.ensemble * 100).toFixed(1)}%
  Votes:    ${m.votes}/3
  Market signal: ${m.features?.market_signal?.toFixed(1) ?? "N/A"}/2.5
`.trim()
}

// ── Debate one game ───────────────────────

async function debateGame(game) {
  const brief = gameBrief(game)
  console.log(`  ⚡ ${game.match}`)

  const votes = {}

  // Run all 3 AIs in parallel
  await Promise.all(
    Object.entries(PERSONAS).map(async ([key, persona]) => {
      try {
        const userPrompt = `${persona.role}\n\nAnalyze this match for Over 2.5 + BTTS:\n\n${brief}`
        const result = await callLLM(persona.model, SYSTEM_PROMPT, userPrompt)

        votes[key] = {
          name:       persona.name,
          icon:       persona.icon,
          color:      persona.color,
          vote:       result.vote === "YES" ? "YES" : "NO",
          confidence: Math.min(100, Math.max(0, parseInt(result.confidence) || 0)),
          reason:     result.reason || "No reason provided",
          key_signal: result.key_signal || "N/A"
        }
        process.stdout.write(`    ${persona.icon} ${persona.name}: ${votes[key].vote} (${votes[key].confidence}%)  `)
      } catch (err) {
        console.error(`\n    ✗ ${persona.name} failed:`, err.message)
        votes[key] = {
          name:       persona.name,
          icon:       persona.icon,
          color:      persona.color,
          vote:       "ERROR",
          confidence: 0,
          reason:     `API call failed: ${err.message}`,
          key_signal: "N/A"
        }
      }
    })
  )

  console.log()

  // Calculate consensus
  const validVotes  = Object.values(votes).filter(v => v.vote !== "ERROR")
  const yesCount    = validVotes.filter(v => v.vote === "YES").length
  const totalVotes  = validVotes.length || 1
  const avgConf     = Math.round(validVotes.reduce((s,v) => s + v.confidence, 0) / totalVotes)
  const passed      = yesCount >= 2 // majority: at least 2 of 3

  const strength    = yesCount === 3 ? "STRONG"
                    : yesCount === 2 ? "MODERATE"
                    : yesCount === 1 ? "WEAK"
                    : "NONE"

  console.log(`    → ${yesCount}/${totalVotes} YES | ${strength} | Avg conf: ${avgConf}%`)

  return {
    ...game,
    debate: {
      passed,
      yes_count:      yesCount,
      total_votes:    totalVotes,
      avg_confidence: avgConf,
      strength,
      votes,
      summary: `${yesCount}/${totalVotes} AIs recommend Over 2.5 + BTTS — ${strength} consensus at ${avgConf}% average confidence`
    }
  }
}

// ── Main ──────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════════════╗")
  console.log("║  Team Free Will — AI Debate Engine   ║")
  console.log("║  Gemini + DeepSeek + GPT-4o-mini     ║")
  console.log("╚══════════════════════════════════════╝\n")

  // Load top 10 from freewill-engine
  let top10 = []
  try {
    const raw = JSON.parse(fs.readFileSync("public/freewill-predictions.json"))
    top10 = raw.top10 || []
  } catch {
    console.error("❌ public/freewill-predictions.json not found — run freewill-engine.js first")
    process.exit(1)
  }

  if (top10.length === 0) {
    console.log("⚠ No games to debate — writing empty output")
    fs.writeFileSync("public/freewill-debate.json", JSON.stringify({
      last_scan: new Date().toISOString(), games_debated: 0, passed: 0, results: []
    }, null, 2))
    return
  }

  console.log(`📋 Debating ${top10.length} games with 3 AIs each...\n`)

  const results = []

  for (const game of top10) {
    const r = await debateGame(game)
    results.push(r)
    await new Promise(res => setTimeout(res, 300))
  }

  // Sort: passed first → by yes_count → by avg_confidence
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

  console.log("\n╔══════════════════════════════════════╗")
  console.log(`║  ✅ Debate complete!                 ║`)
  console.log(`║  Games debated : ${String(results.length).padEnd(20)}║`)
  console.log(`║  Passed (2+/3) : ${String(passed.length).padEnd(20)}║`)
  console.log("╚══════════════════════════════════════╝\n")
}

run()
