// ══════════════════════════════════════════
//  AivsBookie — engine.js
//  Run: node engine.js
//
//  Uses local analysts.js — no API needed.
// ══════════════════════════════════════════

require("dotenv").config()

const fs    = require("fs")
const axios = require("axios")
const { runEnsemble } = require("./analysts")

const BSD_API   = "https://sports.bzzoiro.com/api/predictions/?upcoming=true"
const BSD_TOKEN = process.env.BSD_TOKEN

// ── BSD: fetch all pages ──────────────────

async function fetchAllPages() {
  const all = []
  let url   = BSD_API
  let page  = 1

  while (url) {
    console.log(`  Fetching page ${page}...`)
    const res = await axios.get(url, {
      headers: { Authorization: `Token ${BSD_TOKEN}` }
    })
    const body = res.data
    all.push(...(body.results || []))
    url = body.next || null
    page++
  }

  return all
}

// ── Main ──────────────────────────────────

async function run() {
  console.log("\n═══════════════════════════════")
  console.log("  AivsBookie Engine")
  console.log("═══════════════════════════════\n")

  if (!BSD_TOKEN) {
    console.error("❌ BSD_TOKEN is not set in .env")
    process.exit(1)
  }

  try {
    console.log("📡 Fetching games from BSD API...")
    const raw = await fetchAllPages()
    console.log(`   ${raw.length} total predictions fetched\n`)

    // 48h window handles BSD's Dubai timezone offset
    const now    = new Date()
    const next48 = new Date(now.getTime() + 48 * 60 * 60 * 1000)

    const candidates = []

    for (const p of raw) {
      const over  = (p.prob_over_25  || 0) / 100
      const btts  = (p.prob_btts_yes || 0) / 100
      const combo = over * btts

      const kickoff = p.event?.event_date ? new Date(p.event.event_date) : null
      if (!kickoff || kickoff > next48) continue

      candidates.push({
        league:            p.event?.league?.name || "Unknown",
        match:             `${p.event?.home_team} vs ${p.event?.away_team}`,
        date:              kickoff.toLocaleDateString(),
        time:              kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        predicted_result:  p.predicted_result    || null,
        most_likely_score: p.most_likely_score   || null,
        xg_home:           p.expected_home_goals ?? null,
        xg_away:           p.expected_away_goals ?? null,
        confidence:        p.confidence          ?? null,
        favorite_prob:     p.favorite_prob       ?? null,
        probability:       { over25: over, btts, combo },
        score:             combo
      })
    }

    candidates.sort((a, b) => b.score - a.score)
    const top20 = candidates.slice(0, 20)

    console.log(`🎯 ${candidates.length} games found → analysing top ${top20.length}\n`)
    console.log("🔍 Running local analyst ensemble...\n")

    const results = top20.map(c => {
      const r    = runEnsemble(c)
      const icon = r.ai.consensus ? "✅" : "❌"
      const v    = r.ai.votes
      console.log(`  ${icon} ${c.match}`)
      console.log(`     Stats: ${v.statistics.vote} | Form: ${v.form.vote} | Value: ${v.value.vote}`)
      return r
    })

    const confirmed = results.filter(r => r.ai.consensus)

    const output = {
      last_scan:     new Date().toISOString(),
      games_scanned: raw.length,
      candidates:    top20.length,
      ai_confirmed:  confirmed.length,
      predictions:   results
    }

    fs.writeFileSync(
      "public/predictions.json",
      JSON.stringify(output, null, 2)
    )

    console.log("\n═══════════════════════════════")
    console.log(`  ✅ Done!`)
    console.log(`  Games scanned  : ${raw.length}`)
    console.log(`  Candidates     : ${top20.length}`)
    console.log(`  AI confirmed   : ${confirmed.length}`)
    console.log("═══════════════════════════════\n")

  } catch (err) {
    console.error("\n❌ Engine error:", err.message)
    if (err.response?.data) {
      console.error("   API response:", JSON.stringify(err.response.data, null, 2))
    }
    process.exit(1)
  }
}

run()
