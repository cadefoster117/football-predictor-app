// AivsBookie — accas.js
// Builds 3 accumulators (3-fold, 5-fold, 10-fold)
// Uses all available betting markets per game

const MARKET_CONFIG = [
  { key: "prob_over_15",  name: "Over 1.5 Goals", min: 0.78, emoji: "⚽" },
  { key: "prob_over_25",  name: "Over 2.5 Goals", min: 0.60, emoji: "⚽" },
  { key: "prob_btts_yes", name: "BTTS",           min: 0.60, emoji: "🎯" },
  { key: "prob_home_win", name: "Home Win",        min: 0.62, emoji: "🏠" },
  { key: "prob_away_win", name: "Away Win",        min: 0.58, emoji: "✈️" },
  { key: "prob_over_35",  name: "Over 3.5 Goals", min: 0.42, emoji: "🔥" },
]

function pct(v) {
  if (v == null) return "—"
  const n = typeof v === "number" && v <= 1 ? v * 100 : v
  return n.toFixed(1) + "%"
}

// Find best eligible market for a game
function getBestMarket(game) {
  let best = null
  for (const m of MARKET_CONFIG) {
    const rawVal = game[m.key]
    if (rawVal == null) continue
    const prob = rawVal > 1 ? rawVal / 100 : rawVal
    if (prob < m.min) continue
    if (!best || prob > best.prob) {
      best = { ...m, prob, display: (prob * 100).toFixed(1) + "%" }
    }
  }
  return best
}

// Build an acca from a list of selections
function buildAcca(selections, size) {
  const picks = selections.slice(0, size)
  if (picks.length < size) return null
  const combinedProb = picks.reduce((p, s) => p * s.market.prob, 1)
  return { picks, combinedProb, size }
}

// Render one acca block
function renderAcca(acca, title, subtitle, color) {
  if (!acca) return ""

  const pickRows = acca.picks.map((s, i) => `
    <div class="acca-pick-row">
      <div class="acca-pick-num">${i + 1}</div>
      <div class="acca-pick-info">
        <div class="acca-pick-league">${s.league || "Unknown"}</div>
        <div class="acca-pick-match">${s.match || "Unknown"}</div>
        <div class="acca-pick-time">${s.date || ""} · ${s.time || ""}</div>
      </div>
      <div class="acca-pick-market">
        <div class="acca-market-name">${s.market.emoji} ${s.market.name}</div>
        <div class="acca-market-prob" style="color:var(--${color})">${s.market.display}</div>
      </div>
    </div>`).join("")

  const combinedPct = (acca.combinedProb * 100).toFixed(2) + "%"
  const estimatedOdds = (1 / acca.combinedProb).toFixed(2)

  return `
    <div class="acca-block">
      <div class="acca-block-header">
        <div>
          <div class="acca-block-title" style="color:var(--${color})">${title}</div>
          <div class="acca-block-sub">${subtitle}</div>
        </div>
        <div class="acca-block-odds">
          <div class="acca-odds-val" style="color:var(--${color})">${estimatedOdds}x</div>
          <div class="acca-odds-label">est. odds</div>
        </div>
      </div>
      <div class="acca-picks-list">${pickRows}</div>
      <div class="acca-footer">
        <div class="acca-combined">
          Combined probability: <strong>${combinedPct}</strong>
        </div>
        <div class="acca-warning">⚠ Estimate only — always check bookmaker odds</div>
      </div>
    </div>`
}

async function init() {
  const heroTitle = document.getElementById("hero-title")
  const heroSub   = document.getElementById("hero-sub")
  const strip     = document.getElementById("stats-strip")
  const container = document.getElementById("accas-container")

  try {
    // Fetch full market data from freewill-predictions
    const res = await fetch("/freewill-predictions")
    if (!res.ok) throw new Error("No data — run the engine first")
    const data = await res.json()

    const games = data.top10 || []

    if (games.length === 0) {
      heroTitle.textContent = "No games available"
      heroSub.textContent   = "Engine hasn't run yet or no games in window"
      container.innerHTML   = `<div class="state-msg"><div class="state-icon">📋</div>No games found.<br>Check back after the engine runs.</div>`
      return
    }

    // Build selection pool: best market per game
    const selections = []
    for (const game of games) {
      const market = getBestMarket(game)
      if (market) selections.push({ ...game, market })
    }

    // Also pull confirmed picks from main predictions for extra markets
    try {
      const res2 = await fetch("/predictions")
      if (res2.ok) {
        const data2 = await res2.json()
        const confirmed = (data2.predictions || []).filter(p => p.ai?.consensus)
        for (const p of confirmed) {
          const alreadyIn = selections.find(s => s.match === p.match)
          if (!alreadyIn && p.probability) {
            const synth = {
              match:             p.match,
              league:            p.league,
              date:              p.date,
              time:              p.time,
              prob_over_25:      p.probability.over25 * 100,
              prob_btts_yes:     p.probability.btts   * 100,
            }
            const market = getBestMarket(synth)
            if (market) selections.push({ ...synth, market })
          }
        }
      }
    } catch {}

    // Sort by probability descending
    selections.sort((a, b) => b.market.prob - a.market.prob)

    const acca3  = buildAcca(selections, 3)
    const acca5  = buildAcca(selections, 5)
    const acca10 = buildAcca(selections, 10)

    heroTitle.textContent = `${selections.length} Selections Available`
    heroSub.textContent   = `${new Date(data.last_scan).toLocaleString()} · Best market per game`

    // Stats strip
    ;[
      { label: "Games",      value: games.length },
      { label: "Selections", value: selections.length },
      { label: "3-Fold",     value: acca3  ? (1/acca3.combinedProb).toFixed(1) + "x"  : "N/A", cls: "green" },
      { label: "5-Fold",     value: acca5  ? (1/acca5.combinedProb).toFixed(1) + "x"  : "N/A", cls: "amber" },
      { label: "10-Fold",    value: acca10 ? (1/acca10.combinedProb).toFixed(1) + "x" : "N/A", cls: "red"   },
    ].forEach(s => {
      const b = document.createElement("div")
      b.className = "stat-box"
      b.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls||""}">${s.value}</div>`
      strip.appendChild(b)
    })

    container.innerHTML = `
      <div class="section-head">3-Fold Accumulator</div>
      ${renderAcca(acca3,  "3-Fold Acca", "3 strongest selections", "green")}

      <div class="section-head">5-Fold Accumulator</div>
      ${renderAcca(acca5,  "5-Fold Acca", "5 best value selections", "amber")}

      <div class="section-head">10-Fold Accumulator</div>
      ${renderAcca(acca10, "10-Fold Acca", "Full slate — high risk, high reward", "red")}
    `

  } catch (err) {
    heroTitle.textContent = "Error loading accas"
    container.innerHTML   = `<div class="state-msg"><div class="state-icon">⚙️</div>${err.message}</div>`
  }
}

init()
