// ══════════════════════════════════════════
//  AivsBookie — accas-engine.js
//  Fetches REAL today's fixtures from BSD
//  then asks DeepSeek to build 3 accas
//  from ONLY those actual games.
//  No hallucination possible.
// ══════════════════════════════════════════

require("dotenv").config()

const fs    = require("fs")
const path  = require("path")
const axios = require("axios")
const { callLLM } = require("./llm-helper")

const BSD_TOKEN = process.env.BSD_TOKEN
const TIMEZONE  = process.env.SCAN_TIMEZONE || "Europe/Sofia"

// ── Get today's date in Sofia time ────────

function getTodayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE }) // "YYYY-MM-DD"
}

function getTodayLabel() {
  return new Date().toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  })
}

// ── Fetch today's fixtures from BSD ───────

async function fetchTodayFixtures() {
  const dateISO = getTodayISO()
  const all     = []
  let url = `https://sports.bzzoiro.com/api/predictions/?upcoming=true`

  while (url) {
    const res  = await axios.get(url, {
      headers: { Authorization: `Token ${BSD_TOKEN}` }
    })
    all.push(...(res.data.results || []))
    url = res.data.next || null
  }

  // Filter to today only (Sofia time)
  const todayFixtures = all.filter(p => {
    if (!p.event?.event_date) return false
    const kickoffISO = new Date(p.event.event_date)
      .toLocaleDateString("en-CA", { timeZone: TIMEZONE })
    return kickoffISO === dateISO
  })

  return todayFixtures.map(p => ({
    match:        `${p.event.home_team} vs ${p.event.away_team}`,
    league:       p.event.league?.name || "Unknown",
    kickoff:      new Date(p.event.event_date).toLocaleTimeString("en-GB", {
                    timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit"
                  }),
    over25:       p.prob_over_25?.toFixed(1) + "%",
    btts:         p.prob_btts_yes?.toFixed(1) + "%",
    home_win:     p.prob_home_win?.toFixed(1) + "%",
    draw:         p.prob_draw?.toFixed(1) + "%",
    away_win:     p.prob_away_win?.toFixed(1) + "%",
    over15:       p.prob_over_15?.toFixed(1) + "%",
    over35:       p.prob_over_35?.toFixed(1) + "%",
    xg_home:      p.expected_home_goals?.toFixed(2),
    xg_away:      p.expected_away_goals?.toFixed(2),
    likely_score: p.most_likely_score || "N/A",
    confidence:   p.confidence != null ? (p.confidence * 100).toFixed(0) + "%" : "N/A",
    btts_rec:     p.btts_recommend    ? "YES" : "NO",
    over25_rec:   p.over_25_recommend ? "YES" : "NO",
  }))
}

// ── Build one acca from real fixtures ─────

const SYSTEM_PROMPT = `You are a professional football betting analyst.
You will be given a list of REAL football fixtures happening TODAY with their actual probability data.
Your job is to select the best bets from ONLY the fixtures provided — do not add any other matches.
Respond ONLY with valid JSON. No markdown, no text outside the JSON.`

async function buildAcca(targetOdds, type, fixtures, dateLabel, dateISO) {
  const fixtureList = fixtures.map((f, i) =>
    `${i+1}. ${f.match} (${f.league}) — Kickoff: ${f.kickoff}
   Over1.5: ${f.over15} | Over2.5: ${f.over25} | Over3.5: ${f.over35}
   BTTS: ${f.btts} | Home: ${f.home_win} | Draw: ${f.draw} | Away: ${f.away_win}
   xG: ${f.xg_home}(H) / ${f.xg_away}(A) | Likely score: ${f.likely_score} | Confidence: ${f.confidence}
   Recommends → BTTS: ${f.btts_rec} | Over2.5: ${f.over25_rec}`
  ).join("\n\n")

  const userPrompt = `TODAY: ${dateLabel} (${dateISO})

Here are the ONLY real fixtures available today. You MUST only pick from this list:

${fixtureList}

Build a football accumulator from these fixtures with total odds of approximately ${targetOdds}.
Pick the best value markets (Over/Under, BTTS, Home Win, Away Win, Draw, etc).

Respond with ONLY this JSON:
{
  "label": "short name for this acca",
  "target_odds": ${targetOdds},
  "estimated_total_odds": number,
  "selections": [
    {
      "match": "exact match name from the list above",
      "league": "league name",
      "kickoff": "HH:MM",
      "bet": "exact bet e.g. Over 2.5 Goals",
      "estimated_odds": number,
      "reason": "one sentence why"
    }
  ],
  "summary": "one sentence about this acca"
}`

  return await callLLM("deepseek", SYSTEM_PROMPT, userPrompt)
}

// ── Main ──────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════╗")
  console.log("║  AivsBookie — Accas Engine   ║")
  console.log("╚══════════════════════════════╝\n")

  if (!BSD_TOKEN) {
    console.error("❌ BSD_TOKEN not set in .env")
    process.exit(1)
  }

  const dateISO   = getTodayISO()
  const dateLabel = getTodayLabel()
  console.log(`📅 ${dateLabel} (${dateISO}) — ${TIMEZONE}`)

  console.log("📡 Fetching today's fixtures from BSD API...")
  let fixtures = []
  try {
    fixtures = await fetchTodayFixtures()
    console.log(`   ✅ ${fixtures.length} real fixtures found for today\n`)
  } catch (err) {
    console.error("❌ Failed to fetch fixtures:", err.message)
    process.exit(1)
  }

  if (fixtures.length === 0) {
    console.log("⚠ No fixtures found for today — writing empty output")
    fs.writeFileSync(
      path.join(__dirname, "public/accas.json"),
      JSON.stringify({
        last_scan: new Date().toISOString(),
        date_label: dateLabel,
        date_iso:   dateISO,
        timezone:   TIMEZONE,
        accas:      [],
        note:       "No fixtures found for today"
      }, null, 2)
    )
    return
  }

  const targets = [
    { odds: 2.00,  type: "safe"  },
    { odds: 5.00,  type: "value" },
    { odds: 10.00, type: "bold"  },
  ]

  const accas = []

  for (const t of targets) {
    try {
      console.log(`🤖 Building ~${t.odds} odds acca...`)
      const acca = await buildAcca(t.odds, t.type, fixtures, dateLabel, dateISO)
      accas.push({ ...acca, type: t.type, date: dateISO })
      console.log(`   ✅ ${acca.selections?.length || 0} picks — est. ${acca.estimated_total_odds}x`)
    } catch (err) {
      console.error(`   ❌ Failed:`, err.message)
      accas.push({
        type: t.type, label: `~${t.odds} Accumulator`,
        target_odds: t.odds, estimated_total_odds: t.odds,
        date: dateISO, selections: [],
        summary: `Could not generate — ${err.message}`,
        error: true
      })
    }
    await new Promise(r => setTimeout(r, 800))
  }

  fs.writeFileSync(
    path.join(__dirname, "public/accas.json"),
    JSON.stringify({
      last_scan:       new Date().toISOString(),
      date_label:      dateLabel,
      date_iso:        dateISO,
      timezone:        TIMEZONE,
      fixtures_used:   fixtures.length,
      accas
    }, null, 2)
  )

  console.log("\n✅ accas.json saved\n")
}

run()
