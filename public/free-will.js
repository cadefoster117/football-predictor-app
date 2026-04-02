// ══════════════════════════════════════════
//  AivsBookie — freewill.js
//  Team Free Will debate page frontend
// ══════════════════════════════════════════

const PANEL_ORDER = ["quant", "advocate", "skeptic", "contrarian", "judge"]

// ── Render helpers ────────────────────────

function pct(v) {
  if (v == null) return "—"
  return (typeof v === "number" && v <= 1 ? v * 100 : v).toFixed(1) + "%"
}

function modelColor(label) {
  if (!label) return ""
  if (label.includes("STRONG YES")) return "green"
  if (label.includes("YES"))        return "green"
  if (label.includes("LEAN YES"))   return "amber"
  if (label.includes("LEAN NO"))    return "amber"
  return "red"
}

function highlightFatal(text) {
  if (!text) return "—"
  return text.replace(/(FATAL FLAW[:\s][^.!?]*[.!?])/gi,
    '<span class="fatal">$1</span>')
}

// ── Build a single debate card ────────────

function buildCard(game, index) {
  const d = game.debate
  const m = game.models

  if (!d || !m) return null

  const passed      = d.passed
  const verdict     = d.verdict
  const panel       = d.panel
  const cardClass   = passed ? "passed" : "failed"
  const vClass      = passed ? "pass" : "fail"
  const vText       = passed ? "✓ PASS" : "✗ FAIL"
  const confidence  = verdict?.confidence ?? 0

  // ── Model scores row
  const modelScores = `
    <div class="model-strip">
      <div class="model-cell">
        <div class="model-label">XGBoost</div>
        <div class="model-val ${modelColor(m.xgboost?.label)}">${(m.xgboost?.score * 100)?.toFixed(1) ?? "—"}%</div>
      </div>
      <div class="model-cell">
        <div class="model-label">LightGBM</div>
        <div class="model-val ${modelColor(m.lightgbm?.label)}">${(m.lightgbm?.score * 100)?.toFixed(1) ?? "—"}%</div>
      </div>
      <div class="model-cell">
        <div class="model-label">CatBoost</div>
        <div class="model-val ${modelColor(m.catboost?.label)}">${(m.catboost?.score * 100)?.toFixed(1) ?? "—"}%</div>
      </div>
      <div class="model-cell">
        <div class="model-label">Ensemble</div>
        <div class="model-val amber">${(m.ensemble * 100)?.toFixed(1) ?? "—"}%</div>
      </div>
      <div class="model-cell">
        <div class="model-label">Model Votes</div>
        <div class="model-val ${m.votes >= 2 ? "green" : "red"}">${m.votes ?? 0}/3</div>
      </div>
      <div class="model-cell">
        <div class="model-label">Over 2.5</div>
        <div class="model-val">${pct(game.prob_over_25)}</div>
      </div>
      <div class="model-cell">
        <div class="model-label">BTTS</div>
        <div class="model-val">${pct(game.prob_btts_yes)}</div>
      </div>
    </div>`

  // ── Panelist rows
  const panelistRows = PANEL_ORDER.map(key => {
    const p = panel?.[key]
    if (!p) return ""

    const isJudge = key === "judge"

    let content = ""
    if (isJudge) {
      content = `
        <div class="judge-verdict-box">
          <div class="judge-verdict-line ${vClass}">${verdict?.reason || "No verdict recorded"}</div>
        </div>`
    } else {
      content = `<div class="panelist-arg">${highlightFatal(p.argument)}</div>`
    }

    return `
      <div class="panelist-row">
        <div class="panelist-id">
          <span class="panelist-icon">${p.icon}</span>
          <span class="panelist-role ${p.color}">${p.color === "white" ? "judge" : key}</span>
        </div>
        <div class="panelist-body">
          <div class="panelist-name">${p.name}</div>
          ${content}
        </div>
      </div>`
  }).join("")

  const card = document.createElement("div")
  card.className   = `debate-card ${cardClass}`
  card.dataset.filter = passed ? "passed" : "failed"
  card.style.animationDelay = `${Math.min(index, 8) * 80}ms`

  card.innerHTML = `
    <div class="debate-head">
      <div class="debate-match-info">
        <div class="debate-league">${game.league || "Unknown"}</div>
        <div class="debate-match">${game.match || "Unknown"}</div>
        <div class="debate-time">${game.date || ""} · ${game.time || ""}</div>
      </div>
      <div class="verdict-badge">
        <span class="verdict-main ${vClass}">${vText}</span>
        <span class="verdict-conf">Confidence: ${confidence}%</span>
      </div>
    </div>

    ${modelScores}

    <div class="debate-panel">
      <div class="panel-title">AI Panel Debate</div>
      ${panelistRows}
    </div>
  `

  return card
}

// ── Render stats strip ─────────────────────

function renderStats(data) {
  const strip = document.getElementById("stats-strip")
  strip.innerHTML = ""

  const stats = [
    { label: "Scanned",  value: data.games_scanned  || 0 },
    { label: "In 24h",   value: data.games_in_24h   || 0 },
    { label: "Debated",  value: data.games_debated  || 0 },
    { label: "Passed",   value: data.passed         || 0,  cls: "green" },
    { label: "Scan Time",value: data.last_scan
        ? new Date(data.last_scan).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "—",                                              cls: "amber" },
  ]

  stats.forEach(s => {
    const box = document.createElement("div")
    box.className = "stat-box"
    box.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls || ""}">${s.value}</div>`
    strip.appendChild(box)
  })
}

// ── Filter logic ──────────────────────────

function initFilters() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active", "active-red"))
      btn.classList.add("active")

      const filter = btn.dataset.filter
      document.querySelectorAll(".debate-card").forEach(card => {
        const show =
          filter === "all"    ? true :
          filter === "passed" ? card.dataset.filter === "passed" :
          filter === "failed" ? card.dataset.filter === "failed" : true
        card.style.display = show ? "block" : "none"
      })
    })
  })
}

// ── Main ──────────────────────────────────

async function init() {
  const heroTitle  = document.getElementById("hero-title")
  const heroSub    = document.getElementById("hero-sub")
  const sectionHead = document.getElementById("section-head")
  const filterBar  = document.getElementById("filter-bar")
  const list       = document.getElementById("debate-list")

  try {
    // Try debate results first
    let data = null
    let source = "debate"

    try {
      const res = await fetch("/freewill-debate")
      if (res.ok) data = await res.json()
    } catch {}

    // Fallback to model-only results if debate hasn't run
    if (!data || !data.results?.length) {
      const res2 = await fetch("/freewill-predictions")
      if (res2.ok) {
        const raw = await res2.json()
        if (raw.top10?.length) {
          data = {
            last_scan:     raw.last_scan,
            games_scanned: raw.games_scanned,
            games_in_24h:  raw.games_in_24h,
            games_debated: 0,
            passed:        raw.confirmed || 0,
            results:       raw.top10
          }
          source = "models"
        }
      }
    }

    if (!data || !data.results?.length) {
      heroTitle.textContent = "No debate data yet"
      heroSub.textContent   = "Run freewill-engine.js then freewill-debate.js"
      const msg = document.createElement("div")
      msg.className = "state-msg"
      msg.innerHTML = `<div class="state-icon">🤖</div>Debate not run yet.<br>Hit <code>/run-freewill-debate</code> to start it.`
      list.appendChild(msg)
      return
    }

    // Render stats
    renderStats(data)

    const results = data.results
    const passed  = results.filter(r => r.debate?.passed).length || data.passed

    heroTitle.textContent =
      source === "debate"
        ? `${passed} Pick${passed !== 1 ? "s" : ""} Passed the Debate`
        : `${results.length} Games — Awaiting Debate`

    heroSub.textContent =
      source === "debate"
        ? `Last debate: ${new Date(data.last_scan).toLocaleString()}`
        : `Models ran at ${new Date(data.last_scan).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — debate pending`

    if (results.length > 0) {
      sectionHead.style.display = "flex"
      filterBar.style.display   = "flex"
    }

    results.forEach((game, i) => {
      // If no debate yet, fake a panel-free card showing model scores only
      if (!game.debate) {
        game.debate = {
          passed:  game.models?.consensus || false,
          verdict: { verdict: "PENDING", confidence: 0, reason: "Debate not run yet", fatal_flaw_found: false },
          panel:   null
        }
      }

      const card = buildCard(game, i)
      if (card) list.appendChild(card)
    })

    initFilters()

  } catch (err) {
    heroTitle.textContent = "Error loading debate"
    heroSub.textContent   = err.message
  }
}

init()
