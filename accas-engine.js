// ══════════════════════════════════════════
//  AivsBookie — accas-engine.js
//  Generates 3 AI accumulators using DeepSeek
//  Saves to public/accas.json once per day
// ══════════════════════════════════════════

require("dotenv").config()

const fs   = require("fs")
const path = require("path")
const { callLLM } = require("./llm-helper")

const SYSTEM_PROMPT = `You are a professional football betting analyst.
You have deep knowledge of today's fixtures, team form, injuries, head-to-head records, and current betting market odds.
Respond ONLY with a valid JSON object. No markdown, no explanation outside the JSON.`

async function buildAcca(targetOdds, type, today) {
  const userPrompt = `Today is ${today}.

Based on available fixtures, form tables, injuries, head-to-head records, and current betting odds, create a football accumulator for me with total odds of approximately ${targetOdds}.

Use any betting markets that give the best value: Over/Under Goals, BTTS, Home Win, Away Win, Draw, Asian Handicap, etc.

Respond with ONLY this JSON:
{
  "label": "string describing this acca",
  "target_odds": ${targetOdds},
  "estimated_total_odds": number,
  "selections": [
    {
      "match": "Home Team vs Away Team",
      "league": "League Name",
      "bet": "Exact bet e.g. Over 2.5 Goals",
      "estimated_odds": number,
      "reason": "One sentence why"
    }
  ],
  "summary": "One sentence about this accumulator"
}`

  return await callLLM("deepseek", SYSTEM_PROMPT, userPrompt)
}

async function run() {
  console.log("\n╔══════════════════════════════╗")
  console.log("║  AivsBookie — Accas Engine   ║")
  console.log("║  Powered by DeepSeek         ║")
  console.log("╚══════════════════════════════╝\n")

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  })

  console.log(`📅 Building accas for: ${today}\n`)

  const targets = [
    { odds: 2.00,  type: "safe"  },
    { odds: 5.00,  type: "value" },
    { odds: 10.00, type: "bold"  },
  ]

  const accas = []

  for (const t of targets) {
    try {
      console.log(`🤖 Generating ~${t.odds} odds acca...`)
      const acca = await buildAcca(t.odds, t.type, today)
      accas.push({ ...acca, type: t.type })
      console.log(`   ✅ ${acca.selections?.length || 0} selections — est. ${acca.estimated_total_odds}x`)
    } catch (err) {
      console.error(`   ❌ Failed:`, err.message)
      accas.push({
        type:                 t.type,
        label:                `~${t.odds} Accumulator`,
        target_odds:          t.odds,
        estimated_total_odds: t.odds,
        selections:           [],
        summary:              `Could not generate — ${err.message}`,
        error:                true
      })
    }
    await new Promise(r => setTimeout(r, 600))
  }

  fs.writeFileSync(
    path.join(__dirname, "public/accas.json"),
    JSON.stringify({ last_scan: new Date().toISOString(), date_label: today, accas }, null, 2)
  )

  console.log("\n✅ accas.json saved\n")
}

run()
