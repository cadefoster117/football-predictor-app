const fs = require("fs")
const axios = require("axios")

const API = "https://sports.bzzoiro.com/api/predictions/?upcoming=true"
const TOKEN = "c856e7f4def835bb1b2e448e6ccda8b47ed188ac"

async function fetchAllPages() {
  const allResults = []
  let url = API

  while (url) {
    const res = await axios.get(url, {
      headers: { Authorization: `Token ${TOKEN}` }
    })
    const body = res.data
    allResults.push(...(body.results || []))
    url = body.next || null  // follow next page, or stop
  }

  return allResults
}

async function run() {
  try {
    const data = await fetchAllPages()

    const predictions = []
    const now = new Date()
    const next24 = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    for (const p of data) {
      const over = (p.prob_over_25 || 0) / 100
      const btts = (p.prob_btts_yes || 0) / 100
      const combo = over * btts

      // ✅ Correct field name from the API docs
      const start = p.event?.event_date
      const kickoff = start ? new Date(start) : null

      if (!kickoff) continue
      if (kickoff < now || kickoff > next24) continue

      predictions.push({
        league: p.event?.league?.name || "Unknown",
        match: p.event?.home_team + " vs " + p.event?.away_team,
        date: kickoff.toLocaleDateString(),
        time: kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        prediction: "Over2.5 & BTTS",
        probability: { over25: over, btts: btts, combo: combo },
        score: combo
      })
    }

    predictions.sort((a, b) => b.score - a.score)
    const top = predictions.slice(0, 10)

    const output = {
      last_scan: new Date().toISOString(),
      games_scanned: data.length,
      predictions: top
    }

    fs.writeFileSync("predictions.json", JSON.stringify(output, null, 2))

    console.log("Scan finished")
    console.log("Games scanned:", data.length)
    console.log("Predictions:", top.length)

  } catch (e) {
    console.log("Engine error:", e.message)
  }
}

run()
