// ══════════════════════════════════════════
//  AivsBookie — accas-engine.js
//  Generates 3 AI accumulators once per day
//  using Gemini via llmapi.ai
//  Saves to public/accas.json
// ══════════════════════════════════════════

require("dotenv").config()

const fs   = require("fs")
const path = require("path")
const { callLLM } = require("./llm-helper")

const SYSTEM_PROMPT = `You are a professional football betting analyst.
You have access to today's fixtures, current form, head-to-head records, injuries, and market odds.
When asked to build an accumulator, you respond ONLY with a valid JSON object.
No markdown, no explanation outside the JSON.`

async function buildAcca(targetOdds, label, today) {
  const userPrompt = `Today is ${today}.

Based on available fixtures, form tables, injuries, head-to-head records, and current betting odds, create a football accumulator for me with total odds of approximately ${targetOdds}.

You must respond ONLY with this exact JSON format:
{
  "label": "${label}",
  "target_odds": ${targetOdds},
  "estimated_total_odds": number,
  "selections": [
    {
      "match": "Home Team vs Away Team",
      "league": "League Name",
      "bet": "Bet description e.g. Over 2.5 Goals / Home Win / BTTS Yes",
      "estimated_odds": number,
      "reason": "One sentence explaining why"
    }
  ],
  "summary": "One sentence about this accumulator"
}`

  return await callLLM("gemini", SYSTEM_PROMPT, userPrompt)
}

async function run() {
  console.log("\n╔══════════════════════════════╗")
  console.log("║  AivsBookie — Accas Engine   ║")
  console.log("║  Powered by Gemini AI        ║")
  console.log("╚══════════════════════════════╝\n")

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  })

  console.log(`📅 Building accas for: ${today}\n`)

  const accas = []

  const targets = [
    { odds: 2.00, label: "3-Fold Safe Acca (~2.00 odds)",  name: "safe"   },
    { odds: 5.00, label: "5-Fold Value Acca (~5.00 odds)", name: "value"  },
    { odds: 10.00, label: "10-Fold Bold Acca (~10.00 odds)", name: "bold" },
  ]

  for (const t of targets) {
    try {
      console.log(`🤖 Generating ${t.label}...`)
      const acca = await buildAcca(t.odds, t.label, today)
      accas.push({ ...acca, type: t.name })
      console.log(`   ✅ ${acca.selections?.length || 0} selections, est. ${acca.estimated_total_odds}x odds`)
      await new Promise(r => setTimeout(r, 500))
    } catch (err) {
      console.error(`   ❌ Failed ${t.label}:`, err.message)
      accas.push({
        type:  t.name,
        label: t.label,
        target_odds:          t.odds,
        estimated_total_odds: t.odds,
        selections:           [],
        summary:              `Could not generate — API error: ${err.message}`,
        error:                true
      })
    }
  }

  const output = {
    last_scan:   new Date().toISOString(),
    date_label:  today,
    accas
  }

  fs.writeFileSync(
    path.join(__dirname, "public/accas.json"),
    JSON.stringify(output, null, 2)
  )

  console.log("\n✅ Accas saved to public/accas.json\n")
}

run()
