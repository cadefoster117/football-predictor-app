// ══════════════════════════════════════════
//  AivsBookie — freewill-debate.js
//  Team Free Will Debate Engine
//
//  5 AI personas debate each top game:
//    📊 The Quant     — pure numbers
//    🟢 The Advocate  — argues YES
//    🔴 The Skeptic   — argues NO
//    🎲 The Contrarian — challenges consensus
//    ⚖️  The Judge     — final verdict
//
//  A game PASSES only if Judge says PASS
//  AND Skeptic didn't find a fatal flaw.
// ══════════════════════════════════════════

require("dotenv").config()

const fs    = require("fs")
const axios = require("axios")

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const CLAUDE_MODEL  = "claude-sonnet-4-20250514"

// ── Personas ──────────────────────────────

const PERSONAS = {

  quant: {
    icon:  "📊",
    name:  "The Quant",
    color: "blue",
    system: `You are The Quant — a pure quantitative analyst who only speaks in data.
You never use emotional language. You present numbers, ratios, and model outputs only.
You have no opinion — you only structure the evidence for others to judge.
You always format your response as a tight data brief: key numbers, model signals, and one line on what the data suggests.`
  },

  advocate: {
    icon:  "🟢",
    name:  "The Advocate",
    color: "green",
    system: `You are The Advocate — your job is to make the strongest possible case for betting Over 2.5 & BTTS on this match.
You believe in this pick. You find every positive signal and explain why this game WILL produce goals from both sides.
You are persuasive and confident. You do NOT fabricate data — you build your argument entirely from the data provided.
Be specific and compelling. One strong paragraph.`
  },

  skeptic: {
    icon:  "🔴",
    name:  "The Skeptic",
    color: "red",
    system: `You are The Skeptic — your job is to find every reason why this bet will FAIL.
You are deeply suspicious of Over 2.5 & BTTS bets. You look for red flags: clean sheet risk, heavy favourite, low xG for one team, low confidence, draw-favoured with defensive setups.
You are brutal and direct. If you find a FATAL FLAW — something that kills the bet outright — you must label it clearly as "FATAL FLAW:".
One strong paragraph. Do not invent data — only use what is provided.`
  },

  contrarian: {
    icon:  "🎲",
    name:  "The Contrarian",
    color: "amber",
    system: `You are The Contrarian — you specifically challenge whichever argument is stronger.
You have read both The Advocate and The Skeptic. Your job is to poke holes in the dominant view.
If the game looks like a strong YES, you find the overlooked doubt. If it looks like a NO, you find the overlooked opportunity.
You are sharp, unexpected, and brief. One paragraph. Push back against the obvious conclusion.`
  },

  judge: {
    icon:  "⚖️",
    name:  "The Judge",
    color: "white",
    system: `You are The Judge — you have read The Quant's data, The Advocate's case, The Skeptic's objections, and The Contrarian's challenge.
Your job is to weigh all arguments and deliver a final verdict on whether to bet Over 2.5 & BTTS on this match.

You must respond in this exact JSON format only — no markdown, no extra text:
{
  "verdict": "PASS" or "FAIL",
  "confidence": number between 0 and 100,
  "reason": "one clear sentence explaining your decision",
  "fatal_flaw_found": true or false
}`
  }
}

// ── API call ──────────────────────────────

async function callClaude(systemPrompt, userPrompt, maxTokens = 180) {
  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model:      CLAUDE_MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }]
    },
    {
      headers: {
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json"
      }
    }
  )
  return res.data.content[0].text.trim()
}

// ── Build game brief ──────────────────────

function gameBrief(game) {
  const m = game.models
  return `
MATCH: ${game.match}
LEAGUE: ${game.league}
KICKOFF: ${game.date} ${game.time}

── BSD ML Model Data ──
Over 2.5 probability : ${((game.prob_over_25 ?? 0)).toFixed(1)}%
BTTS probability     : ${((game.prob_btts_yes ?? 0)).toFixed(1)}%
Over 1.5 probability : ${((game.prob_over_15 ?? 0)).toFixed(1)}%
Over 3.5 probability : ${((game.prob_over_35 ?? 0)).toFixed(1)}%
xG Home              : ${game.expected_home_goals ?? "N/A"}
xG Away              : ${game.expected_away_goals ?? "N/A"}
Predicted result     : ${game.predicted_result ?? "N/A"}
Most likely score    : ${game.most_likely_score ?? "N/A"}
Model confidence     : ${game.confidence != null ? (game.confidence * 100).toFixed(0) + "%" : "N/A"}
Favorite win prob    : ${game.favorite_prob != null ? game.favorite_prob.toFixed(1) + "%" : "N/A"}
BSD recommends BTTS  : ${game.btts_recommend ? "YES" : "NO"}
BSD recommends Over2.5: ${game.over_25_recommend ? "YES" : "NO"}

── Our Model Ensemble ──
XGBoost score        : ${(m.xgboost.score * 100).toFixed(1)}% (${m.xgboost.label})
LightGBM score       : ${(m.lightgbm.score * 100).toFixed(1)}% (${m.lightgbm.label})
CatBoost score       : ${(m.catboost.score * 100).toFixed(1)}% (${m.catboost.label})
Ensemble score       : ${(m.ensemble * 100).toFixed(1)}%
Model votes          : ${m.votes}/3
Market signal        : ${m.features.market_signal}/2.5
`.trim()
}

// ── Debate a single game ──────────────────

async function debateGame(game) {
  const brief = gameBrief(game)
  console.log(`  ⚡ Debating: ${game.match}`)

  // Step 1: Quant (no context needed — pure data structuring)
  const quantArg = await callClaude(
    PERSONAS.quant.system,
    `Here is the raw data for this match. Structure it as a data brief:\n\n${brief}`,
    150
  )
  process.stdout.write("    📊 Quant done  ")

  // Step 2: Advocate + Skeptic in parallel (both see the brief)
  const [advocateArg, skepticArg] = await Promise.all([
    callClaude(
      PERSONAS.advocate.system,
      `Make the strongest case for Over 2.5 & BTTS on this match:\n\n${brief}`,
      180
    ),
    callClaude(
      PERSONAS.skeptic.system,
      `Find every reason this bet will fail:\n\n${brief}`,
      180
    )
  ])
  process.stdout.write("🟢 Advocate  🔴 Skeptic done  ")

  // Step 3: Contrarian sees all three
  const contrarian = await callClaude(
    PERSONAS.contrarian.system,
    `You have read the debate. Challenge the stronger side.\n\nDATA:\n${brief}\n\nADVOCATE SAID:\n${advocateArg}\n\nSKEPTIC SAID:\n${skepticArg}`,
    160
  )
  process.stdout.write("🎲 Contrarian done  ")

  // Step 4: Judge sees everything and delivers verdict
  const judgeRaw = await callClaude(
    PERSONAS.judge.system,
    `Deliver your verdict.\n\nDATA:\n${brief}\n\nQUANT:\n${quantArg}\n\nADVOCATE:\n${advocateArg}\n\nSKEPTIC:\n${skepticArg}\n\nCONTRARIAN:\n${contrarian}`,
    120
  )
  process.stdout.write("⚖️  Judge done\n")

  // Parse judge verdict
  let verdict = { verdict: "FAIL", confidence: 0, reason: "Parse error", fatal_flaw_found: false }
  try {
    const clean = judgeRaw.replace(/```json|```/g, "").trim()
    verdict = JSON.parse(clean)
  } catch {
    const vMatch = judgeRaw.match(/"verdict"\s*:\s*"(PASS|FAIL)"/i)
    const cMatch = judgeRaw.match(/"confidence"\s*:\s*(\d+)/)
    const rMatch = judgeRaw.match(/"reason"\s*:\s*"([^"]+)"/)
    const fMatch = judgeRaw.match(/"fatal_flaw_found"\s*:\s*(true|false)/)
    if (vMatch) verdict.verdict          = vMatch[1].toUpperCase()
    if (cMatch) verdict.confidence       = parseInt(cMatch[1])
    if (rMatch) verdict.reason           = rMatch[1]
    if (fMatch) verdict.fatal_flaw_found = fMatch[1] === "true"
  }

  const passed = verdict.verdict === "PASS" && !verdict.fatal_flaw_found

  console.log(`    ${passed ? "✅ PASS" : "❌ FAIL"} — ${verdict.reason}`)

  return {
    ...game,
    debate: {
      passed,
      verdict,
      panel: {
        quant:      { ...PERSONAS.quant,      argument: quantArg },
        advocate:   { ...PERSONAS.advocate,   argument: advocateArg },
        skeptic:    { ...PERSONAS.skeptic,    argument: skepticArg },
        contrarian: { ...PERSONAS.contrarian, argument: contrarian },
        judge:      { ...PERSONAS.judge,      verdict }
      }
    }
  }
}

// ── Main ──────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════════╗")
  console.log("║  Team Free Will — Debate Engine  ║")
  console.log("╚══════════════════════════════════╝\n")

  if (!ANTHROPIC_KEY) {
    console.error("❌ ANTHROPIC_API_KEY is not set in .env")
    process.exit(1)
  }

  // Load top 10 from freewill-engine output
  let top10 = []
  try {
    const raw = JSON.parse(fs.readFileSync("public/freewill-predictions.json"))
    top10 = raw.top10 || []
  } catch {
    console.error("❌ public/freewill-predictions.json not found — run freewill-engine.js first")
    process.exit(1)
  }

  if (top10.length === 0) {
    console.log("⚠️  No games to debate. freewill-predictions.json is empty.")
    fs.writeFileSync("public/freewill-debate.json", JSON.stringify({
      last_scan: new Date().toISOString(),
      passed: 0,
      results: []
    }, null, 2))
    return
  }

  console.log(`📋 ${top10.length} games to debate\n`)

  const results = []

  // Debate games one at a time (sequential to avoid rate limits)
  for (const game of top10) {
    const result = await debateGame(game)
    results.push(result)
    // Small pause between games
    await new Promise(r => setTimeout(r, 500))
  }

  // Sort: passed first, then by judge confidence
  results.sort((a, b) => {
    if (a.debate.passed !== b.debate.passed) return b.debate.passed - a.debate.passed
    return (b.debate.verdict.confidence || 0) - (a.debate.verdict.confidence || 0)
  })

  const passed = results.filter(r => r.debate.passed)

  const output = {
    last_scan:  new Date().toISOString(),
    games_debated: results.length,
    passed:     passed.length,
    results
  }

  fs.writeFileSync("public/freewill-debate.json", JSON.stringify(output, null, 2))

  console.log("\n╔══════════════════════════════════╗")
  console.log(`║  ✅ Debate complete!              ║`)
  console.log(`║  Games debated : ${String(results.length).padEnd(16)}║`)
  console.log(`║  Passed        : ${String(passed.length).padEnd(16)}║`)
  console.log("╚══════════════════════════════════╝\n")
}

run()
