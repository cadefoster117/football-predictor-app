// ══════════════════════════════════════════
//  AivsBookie — freewill-engine.js
//  The Team Free Will prediction engine.
//
//  1. Fetches ALL games in the next 24 hours
//  2. Runs XGBoost + LightGBM + CatBoost
//  3. Ranks all games by ensemble score
//  4. Saves top 10 to public/freewill-predictions.json
// ══════════════════════════════════════════

require("dotenv").config()

const fs    = require("fs")
const axios = require("axios")
const { runModels } = require("./models")

const BSD_BASE  = "https://sports.bzzoiro.com/api"
const BSD_TOKEN = process.env.BSD_TOKEN

const headers = { Authorization: `Token ${BSD_TOKEN}` }

// ── Fetch all pages of predictions ───────

async function fetchAllPredictions() {
  const all  = []
  let url    = `${BSD_BASE}/predictions/?upcoming=true`
  let page   = 1

  while (url) {
    console.log(`  📄 Page ${page}...`)
    const res  = await axios.get(url, { headers })
    const body = res.data
    all.push(...(body.results || []))
    url = body.next || null
    page++
  }

  return all
}

// ── 24h window filter ─────────────────────
// Uses UTC comparison — works correctly
// regardless of BSD's Dubai +04:00 timezone.
// Includes games from 30min ago (clock drift)
// up to exactly 24h from now.

function inNext24Hours(eventDate) {
  if (!eventDate) return false
  const kickoff    = new Date(eventDate)   // JS parses ISO 8601 with tz offset correctly
  const now        = new Date()
  const thirtyAgo  = new Date(now.getTime() - 30 * 60 * 1000)
  const in24h      = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return kickoff >= thirtyAgo && kickoff <= in24h
}

// ── Build candidate object ────────────────

function buildCandidate(p) {
  const kickoff = new Date(p.event.event_date)
  return {
    // Match info
    league:            p.event?.league?.name        || "Unknown",
    match:             `${p.event.home_team} vs ${p.event.away_team}`,
    date:              kickoff.toLocaleDateString(),
    time:              kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    kickoff_utc:       kickoff.toISOString(),

    // BSD ML data (passed through to models)
    prob_over_15:      p.prob_over_15       ?? null,
    prob_over_25:      p.prob_over_25       ?? null,
    prob_over_35:      p.prob_over_35       ?? null,
    prob_btts_yes:     p.prob_btts_yes      ?? null,
    expected_home_goals: p.expected_home_goals ?? null,
    expected_away_goals: p.expected_away_goals ?? null,
    predicted_result:  p.predicted_result   ?? null,
    most_likely_score: p.most_likely_score  ?? null,
    confidence:        p.confidence         ?? null,
    favorite:          p.favorite           ?? null,
    favorite_prob:     p.favorite_prob      ?? null,
    btts_recommend:    p.btts_recommend     ?? false,
    over_25_recommend: p.over_25_recommend  ?? false,
    over_35_recommend: p.over_35_recommend  ?? false,
    prob_home_win:     p.prob_home_win      ?? null,
    prob_draw:         p.prob_draw          ?? null,
    prob_away_win:     p.prob_away_win      ?? null,
  }
}

// ── Main ──────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════╗")
  console.log("║  Team Free Will Engine       ║")
  console.log("║  XGBoost + LightGBM + CatBoost ║")
  console.log("╚══════════════════════════════╝\n")

  if (!BSD_TOKEN) {
    console.error("❌ BSD_TOKEN is not set in .env")
    process.exit(1)
  }

  try {
    // 1. Fetch all predictions
    console.log("📡 Fetching predictions from BSD API...")
    const raw = await fetchAllPredictions()
    console.log(`   ${raw.length} total predictions fetched\n`)

    // 2. Filter to next 24 hours only
    const inWindow = raw.filter(p => inNext24Hours(p.event?.event_date))
    console.log(`⏱  ${inWindow.length} games in next 24 hours\n`)

    if (inWindow.length === 0) {
      console.log("⚠️  No games found in the next 24 hours.")
      console.log("   The BSD API may not have today's fixtures yet.")
      console.log("   Writing empty output...\n")

      fs.writeFileSync(
        "public/freewill-predictions.json",
        JSON.stringify({
          last_scan:    new Date().toISOString(),
          games_scanned: raw.length,
          games_in_24h:  0,
          top10:         []
        }, null, 2)
      )
      return
    }

    // 3. Build candidates and run model ensemble
    console.log("🔬 Running model ensemble on all games...\n")

    const results = inWindow.map(p => {
      const candidate = buildCandidate(p)
      const result    = runModels(candidate)

      const votes = result.models.votes
      const icon  = result.models.consensus
        ? "✅"
        : votes >= 2 ? "⚡" : "❌"

      console.log(`  ${icon} ${candidate.match}`)
      console.log(`     XGB: ${result.models.xgboost.label.padEnd(12)} | LGB: ${result.models.lightgbm.label.padEnd(12)} | CAT: ${result.models.catboost.label}`)
      console.log(`     Ensemble: ${(result.models.ensemble * 100).toFixed(1)}% | Votes: ${votes}/3 | ${result.models.consensus ? "CONFIRMED ✓" : "Not confirmed"}`)

      return result
    })

    // 4. Sort by ensemble score — top 10
    results.sort((a, b) => b.models.ensemble - a.models.ensemble)
    const top10 = results.slice(0, 10)

    const confirmed = top10.filter(r => r.models.consensus)

    // 5. Write output
    const output = {
      last_scan:     new Date().toISOString(),
      games_scanned: raw.length,
      games_in_24h:  inWindow.length,
      confirmed:     confirmed.length,
      top10
    }

    fs.writeFileSync(
      "public/freewill-predictions.json",
      JSON.stringify(output, null, 2)
    )

    console.log("\n╔══════════════════════════════╗")
    console.log("║  ✅ Done!                    ║")
    console.log(`║  Total fetched : ${String(raw.length).padEnd(12)}║`)
    console.log(`║  In 24h window : ${String(inWindow.length).padEnd(12)}║`)
    console.log(`║  Confirmed     : ${String(confirmed.length).padEnd(12)}║`)
    console.log("╚══════════════════════════════╝\n")

  } catch (err) {
    console.error("\n❌ FreeWill Engine error:", err.message)
    if (err.response?.data) {
      console.error("   API response:", JSON.stringify(err.response.data, null, 2))
    }
    process.exit(1)
  }
}

run()
