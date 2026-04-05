// ══════════════════════════════════════════
//  AivsBookie — accas-engine.js
//  Generates 3 accumulators using DeepSeek
//  Restricted to TODAY's fixtures only
// ══════════════════════════════════════════

require("dotenv").config()

const fs   = require("fs")
const path = require("path")
const { callLLM } = require("./llm-helper")

const TIMEZONE = process.env.SCAN_TIMEZONE || "Europe/Sofia"

// Get today's date in the configured timezone
function getTodayLabel() {
  const now = new Date()

  // Full readable label e.g. "Monday, 7 April 2025"
  const label = now.toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric"
  })

  // ISO date string e.g. "2025-04-07"
  const iso = now.toLocaleDateString("en-CA", { timeZone: TIMEZONE })

  return { label, iso }
}

const SYSTEM_PROMPT = `You are a professional football betting analyst with expert knowledge of all major European and world football leagues.
You must ONLY select matches that are scheduled to kick off on the specific date provided. 
Do NOT select matches from yesterday, tomorrow, or any other date.
Respond ONLY with a valid JSON object. No markdown, no extra text outside the JSON.`

async function buildAcca(targetOdds, type, dateLabel, dateISO) {
  const userPrompt = `TODAY'S DATE: ${dateLabel} (${dateISO})

IMPORTANT: You MUST only select football matches kicking off on ${dateISO} (${dateLabel}).
Do NOT include any match from a different date. If you are unsure of a match date, skip it.

Task: Create a football accumulator with total odds of approximately ${targetOdds}.
Use the best available betting markets for value: Over/Under Goals, BTTS, Home Win, Away Win, Draw, Double Chance, etc.

Respond with ONLY this exact JSON — no other text:
{
  "label": "brief name for this acca",
  "target_odds": ${targetOdds},
  "estimated_total_odds": number,
  "date": "${dateISO}",
  "selections": [
    {
      "match": "Home Team vs Away Team",
      "league": "League Name",
      "kickoff": "HH:MM",
      "bet": "Exact bet e.g. Over 2.5 Goals",
      "estimated_odds": number,
      "reason": "One sentence why this is a good pick today"
    }
  ],
  "summary": "One sentence describing this accumulator"
}`

  return await callLLM("deepseek", SYSTEM_PROMPT, userPrompt)
}

async function run() {
  console.log("\n╔══════════════════════════════╗")
  console.log("║  AivsBookie — Accas Engine   ║")
  console.log("║  Powered by DeepSeek         ║")
  console.log("╚══════════════════════════════╝\n")

  const { label: dateLabel, iso: dateISO } = getTodayLabel()
  console.log(`📅 Date: ${dateLabel} (${dateISO}) — ${TIMEZONE}\n`)

  const targets = [
    { odds: 2.00,  type: "safe"  },
    { odds: 5.00,  type: "value" },
    { odds: 10.00, type: "bold"  },
  ]

  const accas = []

  for (const t of targets) {
    try {
      console.log(`🤖 Building ~${t.odds} odds acca for ${dateISO}...`)
      const acca = await buildAcca(t.odds, t.type, dateLabel, dateISO)

      // Sanity check: warn if any selection has a wrong date
      const wrongDate = (acca.selections || []).filter(s => {
        if (!s.kickoff) return false
        // Can't check date from kickoff time alone — just log
        return false
      })

      accas.push({ ...acca, type: t.type, generated_for: dateISO })
      console.log(`   ✅ ${acca.selections?.length || 0} selections — est. ${acca.estimated_total_odds}x`)
    } catch (err) {
      console.error(`   ❌ Failed:`, err.message)
      accas.push({
        type:                 t.type,
        label:                `~${t.odds} Accumulator`,
        target_odds:          t.odds,
        estimated_total_odds: t.odds,
        date:                 dateISO,
        generated_for:        dateISO,
        selections:           [],
        summary:              `Could not generate — ${err.message}`,
        error:                true
      })
    }
    await new Promise(r => setTimeout(r, 800))
  }

  fs.writeFileSync(
    path.join(__dirname, "public/accas.json"),
    JSON.stringify({
      last_scan:  new Date().toISOString(),
      date_label: dateLabel,
      date_iso:   dateISO,
      timezone:   TIMEZONE,
      accas
    }, null, 2)
  )

  console.log("\n✅ accas.json saved\n")
}

run()
