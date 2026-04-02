// ══════════════════════════════════════════
//  AivsBookie — freewill.js
// ══════════════════════════════════════════

const PANEL_ORDER = ["quant", "advocate", "skeptic", "contrarian", "judge"]

// ── DOM refs ──────────────────────────────

const heroTitle   = document.getElementById("hero-title")
const heroSub     = document.getElementById("hero-sub")
const statsStrip  = document.getElementById("stats-strip")
const filterBar   = document.getElementById("filter-bar")
const sectionHead = document.getElementById("section-head")
const list        = document.getElementById("debate-list")

// ── Helpers ───────────────────────────────

function pct(v) {
  if (v == null) return "—"
  const n = typeof v === "number" && v <= 1 ? v * 100 : v
  return n.toFixed(1) + "%"
}

function modelColor(label) {
  if (!label) return ""
  if (label.includes("STRONG YES") || label.includes("YES")) return "green"
  if (label.includes("LEAN")) return "amber"
  return "red"
}

function highlightFatal(text) {
  if (!text) return "—"
  return text.replace(/(FATAL FLAW[:\s][^.!?\n]*[.!?])/gi,
    '<span class="fatal">$1</span>')
}

function safeFetch(url, timeout = 8000) {
  return Promise.race([
    fetch(url).then(r => r.json()),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: " + url)), timeout))
  ])
}

// ── State: show message ───────────────────

function showState(icon, title, sub) {
  heroTitle.textContent = title
  if (sub) heroSub.textContent = sub
  list.innerHTML = `<div class="state-msg"><div class="state-icon">${icon}</div>${sub || ""}</div>`
}

// ── Stats strip ───────────────────────────

function renderStats(scanned, in24h, debated, passed, time) {
  statsStrip.innerHTML = ""
  const items = [
    { label: "Scanned",  value: scanned  ?? "—" },
    { label: "In 24h",   value: in24h    ?? "—" },
    { label: "Debated",  value: debated  ?? "—" },
    { label: "Passed",   value: passed   ?? "—", cls: "green" },
    { label: "Time",     value: time     ?? "—", cls: "amber" },
  ]
  items.forEach(s => {
    const b = document.createElement("div")
    b.className = "stat-box"
    b.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls || ""}">${s.value}</div>`
    statsStrip.appendChild(b)
  })
}

// ── Build debate card ─────────────────────

function buildCard(game, index) {
  const m = game.models || {}
  const d = game.debate || null

  const passed    = d?.passed ?? m.consensus ?? false
  const verdict   = d?.verdict || null
  const panel     = d?.panel   || null

  const cardClass = passed ? "passed" : "failed"
  const vClass    = passed ? "pass"   : "fail"
  const vText     = passed ? "✓ PASS" : "✗ FAIL"
  const conf      = verdict?.confidence ?? 0

  // Model scores strip
  const xgbScore  = m.xgboost  ? (m.xgboost.score  * 100).toFixed(1) + "%" : "—"
  const lgbScore  = m.lightgbm ? (m.lightgbm.score  * 100).toFixed(1) + "%" : "—"
  const catScore  = m.catboost ? (m.catboost.score  * 100).toFixed(1) + "%" : "—"
  const ensScore  = m.ensemble  ? (m.ensemble * 100).toFixed(1) + "%" : "—"

  // Panel rows
  let panelHTML = ""
  if (panel) {
    panelHTML = `<div class="debate-panel">
      <div class="panel-title">AI Panel Debate</div>` +
      PANEL_ORDER.map(key => {
        const p = panel[key]
        if (!p) return ""
        const isJudge = key === "judge"
        const content = isJudge
          ? `<div class="judge-verdict-box">
               <div class="judge-verdict-line ${vClass}">${verdict?.reason || "No verdict"}</div>
             </div>`
          : `<div class="panelist-arg">${highlightFatal(p.argument)}</div>`
        return `
          <div class="panelist-row">
            <div class="panelist-id">
              <span class="panelist-icon">${p.icon || "🤖"}</span>
              <span class="panelist-role ${p.color || "white"}">${key}</span>
            </div>
            <div class="panelist-body">
              <div class="panelist-name">${p.name || key}</div>
              ${content}
            </div>
          </div>`
      }).join("") +
    `</div>`
  } else {
    panelHTML = `<div class="debate-panel">
      <div class="panel-title">AI Panel Debate</div>
      <div class="state-msg" style="padding:20px 0;font-size:0.75rem">
        Debate not run yet — hit <code>/run-freewill-debate</code>
      </div>
    </div>`
  }

  const card = document.createElement("div")
  card.className          = `debate-card ${cardClass}`
  card.dataset.filter     = passed ? "passed" : "failed"
  card.style.animationDelay = `${Math.min(index, 8) * 70}ms`

  card.innerHTML = `
    <div class="debate-head">
      <div class="debate-match-info">
        <div class="debate-league">${game.league || "Unknown"}</div>
        <div class="debate-match">${game.match   || "Unknown"}</div>
        <div class="debate-time">${game.date || ""} · ${game.time || ""}</div>
      </div>
      <div class="verdict-badge">
        <span class="verdict-main ${vClass}">${vText}</span>
        <span class="verdict-conf">${conf > 0 ? "Confidence: " + conf + "%" : "Models: " + (m.votes ?? 0) + "/3"}</span>
      </div>
    </div>

    <div class="model-strip">
      <div class="model-cell">
        <div class="model-label">XGBoost</div>
        <div class="model-val ${modelColor(m.xgboost?.label)}">${xgbScore}</div>
      </div>
      <div class="model-cell">
        <div class="model-label">LightGBM</div>
        <div class="model-val ${modelColor(m.lightgbm?.label)}">${lgbScore}</div>
      </div>
      <div class="model-cell">
        <div class="model-label">CatBoost</div>
        <div class="model-val ${modelColor(m.catboost?.label)}">${catScore}</div>
      </div>
      <div class="model-cell">
        <div class="model-label">Ensemble</div>
        <div class="model-val amber">${ensScore}</div>
      </div>
      <div class="model-cell">
        <div class="model-label">Votes</div>
        <div class="model-val ${(m.votes ?? 0) >= 2 ? "green" : "red"}">${m.votes ?? 0}/3</div>
      </div>
      <div class="model-cell">
        <div class="model-label">Over 2.5</div>
        <div class="model-val">${pct(game.prob_over_25)}</div>
      </div>
      <div class="model-cell">
        <div class="model-label">BTTS</div>
        <div class="model-val">${pct(game.prob_btts_yes)}</div>
      </div>
    </div>

    ${panelHTML}
  `

  return card
}

// ── Filter buttons ────────────────────────

function initFilters() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"))
      btn.classList.add("active")
      const f = btn.dataset.filter
      document.querySelectorAll(".debate-card").forEach(card => {
        card.style.display = f === "all" || card.dataset.filter === f ? "block" : "none"
      })
    })
  })
}

// ── Main ──────────────────────────────────

async function init() {
  heroTitle.textContent = "Loading..."

  let games  = []
  let meta   = {}
  let source = "none"

  // 1. Try debate results
  try {
    const d = await safeFetch("/freewill-debate")
    if (d && Array.isArray(d.results) && d.results.length > 0) {
      games  = d.results
      meta   = d
      source = "debate"
      console.log("[FreeWill] Loaded from /freewill-debate:", games.length, "games")
    }
  } catch (e) {
    console.warn("[FreeWill] /freewill-debate unavailable:", e.message)
  }

  // 2. Fallback: model-only results
  if (games.length === 0) {
    try {
      const d = await safeFetch("/freewill-predictions")
      if (d && Array.isArray(d.top10) && d.top10.length > 0) {
        games  = d.top10
        meta   = { ...d, results: d.top10, games_debated: 0, passed: d.confirmed || 0 }
        source = "models"
        console.log("[FreeWill] Loaded from /freewill-predictions:", games.length, "games")
      }
    } catch (e) {
      console.warn("[FreeWill] /freewill-predictions unavailable:", e.message)
    }
  }

  // 3. Nothing loaded
  if (games.length === 0) {
    showState(
      "🤖",
      "No data yet",
      "The engine hasn't run yet. Check Render logs or hit /run-freewill-debate"
    )
    return
  }

  // 4. Render
  const passed   = source === "debate"
    ? games.filter(g => g.debate?.passed).length
    : (meta.passed || 0)

  const timeStr  = meta.last_scan
    ? new Date(meta.last_scan).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—"

  heroTitle.textContent = source === "debate"
    ? `${passed} Pick${passed !== 1 ? "s" : ""} Passed the Debate`
    : `${games.length} Games Ranked — Debate Pending`

  heroSub.textContent = source === "debate"
    ? `Full 5-panelist debate · Last run ${timeStr}`
    : `Model scores ready · Run /run-freewill-debate for full debate`

  renderStats(
    meta.games_scanned  ?? "—",
    meta.games_in_24h   ?? games.length,
    meta.games_debated  ?? 0,
    passed,
    timeStr
  )

  sectionHead.style.display = "flex"
  filterBar.style.display   = "flex"

  games.forEach((game, i) => {
    const card = buildCard(game, i)
    if (card) list.appendChild(card)
  })

  initFilters()
}

init()
