// ══════════════════════════════════════════
//  AivsBookie — accas-engine.js
//  Fetches REAL today's fixtures from BSD
//  Passes them to DeepSeek to pick from ONLY
//  those actual games. No hallucination.
// ══════════════════════════════════════════

require("dotenv").config()

const fs    = require("fs")
const path  = require("path")
const axios = require("axios")
const { callLLM } = require("./llm-helper")

const BSD_TOKEN = process.env.BSD_TOKEN
const TIMEZONE  = process.env.SCAN_TIMEZONE || "Europe/Sofia"

function getTodayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE })
}

function getTodayLabel() {
  return new Date().toLocaleDateString("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  })
}

// ── Fetch ALL pages of predictions from BSD ─

async function fetchTodayFixtures() {
  const dateISO = getTodayISO()
  const all     = []
  let url = `https://sports.bzzoiro.com/api/predictions/?upcoming=true`

  while (url) {
    const res = await axios.get(url, {
      headers: { Authorization: `Token ${BSD_TOKEN}` }
    })
    all.push(...(res.data.results || []))
    url = res.data.next || null
  }

  // Filter strictly to today in Sofia timezone
  return all.filter(p => {
    if (!p.event?.event_date) return false
    const kickoffISO = new Date(p.event.event_date)
      .toLocaleDateString("en-CA", { timeZone: TIMEZONE })
    return kickoffISO === dateISO
  }).map(p => ({
    match:        `${p.event.home_team} vs ${p.event.away_team}`,
    league:       p.event.league?.name || "Unknown",
    kickoff:      new Date(p.event.event_date)
                    .toLocaleTimeString("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" }),
    home_win:     (p.prob_home_win  ?? 0).toFixed(1),
    draw:         (p.prob_draw      ?? 0).toFixed(1),
    away_win:     (p.prob_away_win  ?? 0).toFixed(1),
    over15:       (p.prob_over_15   ?? 0).toFixed(1),
    over25:       (p.prob_over_25   ?? 0).toFixed(1),
    over35:       (p.prob_over_35   ?? 0).toFixed(1),
    btts:         (p.prob_btts_yes  ?? 0).toFixed(1),
    xg_home:      (p.expected_home_goals ?? 0).toFixed(2),
    xg_away:      (p.expected_away_goals ?? 0).toFixed(2),
    likely_score: p.most_likely_score || "N/A",
    confidence:   p.confidence != null ? (p.confidence * 100).toFixed(0) : "N/A",
    btts_rec:     p.btts_recommend    ? "YES" : "NO",
    over25_rec:   p.over_25_recommend ? "YES" : "NO"
  }))
}

// ── Format fixture list for the AI prompt ──

function formatFixtures(fixtures) {
  return fixtures.map((f, i) =>
`${i + 1}. [${f.league}] ${f.match} — KO: ${f.kickoff}
   1X2: Home ${f.home_win}% / Draw ${f.draw}% / Away ${f.away_win}%
   Goals: O1.5=${f.over15}%  O2.5=${f.over25}%  O3.5=${f.over35}%
   BTTS: ${f.btts}%  xG: ${f.xg_home}(H)/${f.xg_away}(A)  Likely: ${f.likely_score}`
  ).join("\n")
}

// ── Ask DeepSeek to pick from real fixtures ─

const SYSTEM_PROMPT = `You are a professional football betting analyst.
You will receive a numbered list of REAL football matches happening TODAY with their actual probability data from a sports model.
You MUST ONLY select matches from the provided list — use the exact match names as given.
Do NOT invent, modify, or add any match not in the list.
Respond ONLY with valid JSON. No markdown, no text outside the JSON.`

async function buildAcca(targetOdds, type, fixtures, dateLabel, dateISO) {
  const fixtureBlock = formatFixtures(fixtures)

  const userPrompt =
`DATE: ${dateLabel} (${dateISO})

AVAILABLE REAL MATCHES TODAY (pick ONLY from this list):
${fixtureBlock}

Task: Choose selections from the list above to build an accumulator with total odds close to ${targetOdds}.
Use any market that gives good value: Home Win, Away Win, Draw, Over/Under Goals, BTTS, Double Chance.
Use the probability percentages to guide your selections — higher % = more likely = lower odds.

Rules:
- ONLY use matches from the numbered list above
- Use the EXACT match name as written
- Do not add kickoff times that differ from the list
- Number of selections should suit the target odds (fewer for ~2.00, more for ~10.00)

Respond with ONLY this JSON:
{
  "label": "short acca name",
  "target_odds": ${targetOdds},
  "estimated_total_odds": number,
  "selections": [
    {
      "match": "exact match name from list",
      "league": "league name",
      "kickoff": "HH:MM from list",
      "bet": "e.g. Over 2.5 Goals",
      "estimated_odds": number,
      "reason": "one sentence why"
    }
  ],
  "summary": "one sentence about this acca"
}`

  return await callLLM("deepseek", SYSTEM_PROMPT, userPrompt)
}

// ── Main ───────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════╗")
  console.log("║  AivsBookie — Accas Engine   ║")
  console.log("╚══════════════════════════════╝\n")

  if (!BSD_TOKEN) {
    console.error("❌ BSD_TOKEN not set"); process.exit(1)
  }

  const dateISO   = getTodayISO()
  const dateLabel = getTodayLabel()
  console.log(`📅 ${dateLabel} (${dateISO}) — ${TIMEZONE}`)

  console.log("📡 Fetching today's real fixtures from BSD...")
  let fixtures = []
  try {
    fixtures = await fetchTodayFixtures()
    console.log(`   ✅ ${fixtures.length} real fixtures for today\n`)
  } catch (err) {
    console.error("❌ Failed to fetch fixtures:", err.message)
    process.exit(1)
  }

  if (fixtures.length === 0) {
    console.log("⚠ No fixtures for today — writing empty output")
    fs.writeFileSync(path.join(__dirname,"public/accas.json"), JSON.stringify({
      last_scan: new Date().toISOString(),
      date_label: dateLabel, date_iso: dateISO, timezone: TIMEZONE,
      fixtures_found: 0, accas: [], note: "No fixtures found for today"
    }, null, 2))
    return
  }

  const targets = [
    { odds: 2.00,  type: "safe"  },
    { odds: 5.00,  type: "value" },
    { odds: 10.00, type: "bold"  }
  ]

  const accas = []

  for (const t of targets) {
    try {
      console.log(`🤖 Building ~${t.odds} odds acca from ${fixtures.length} real games...`)
      const acca = await buildAcca(t.odds, t.type, fixtures, dateLabel, dateISO)

      // Validate: check every selection exists in our fixture list
      const matchNames = fixtures.map(f => f.match.toLowerCase())
      const invalid = (acca.selections || []).filter(
        s => !matchNames.some(m => m.includes(s.match?.toLowerCase()?.split(" vs ")[0]?.trim() || ""))
      )
      if (invalid.length > 0) {
        console.warn(`   ⚠ ${invalid.length} selection(s) not found in BSD fixture list — removing`)
        acca.selections = (acca.selections || []).filter(
          s => matchNames.some(m => m.includes(s.match?.toLowerCase()?.split(" vs ")[0]?.trim() || ""))
        )
      }

      accas.push({ ...acca, type: t.type, date: dateISO })
      console.log(`   ✅ ${acca.selections?.length || 0} valid picks — est. ${acca.estimated_total_odds}x`)
    } catch (err) {
      console.error(`   ❌ Failed:`, err.message)
      accas.push({
        type: t.type, label: `~${t.odds} Accumulator`,
        target_odds: t.odds, estimated_total_odds: t.odds,
        date: dateISO, selections: [],
        summary: `Could not generate — ${err.message}`, error: true
      })
    }
    await new Promise(r => setTimeout(r, 800))
  }

  fs.writeFileSync(
    path.join(__dirname,"public/accas.json"),
    JSON.stringify({
      last_scan:      new Date().toISOString(),
      date_label:     dateLabel,
      date_iso:       dateISO,
      timezone:       TIMEZONE,
      fixtures_found: fixtures.length,
      accas
    }, null, 2)
  )

  console.log("\n✅ accas.json saved\n")
}

run()
