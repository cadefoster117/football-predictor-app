// AivsBookie — freewill.js
// Team Free Will — 3 AI debate page

const AI_ORDER = ["gemini", "deepseek", "gpt"]

function pct(v) {
  if (v == null) return "—"
  const n = typeof v === "number" && v <= 1 ? v * 100 : v
  return n.toFixed(1) + "%"
}

function modelColor(label) {
  if (!label) return ""
  if (label.includes("STRONG YES") || label === "YES") return "green"
  if (label.includes("LEAN")) return "amber"
  return "red"
}

function safeFetch(url) {
  return Promise.race([
    fetch(url).then(r => r.json()),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout: " + url)), 10000))
  ])
}

const heroTitle   = document.getElementById("hero-title")
const heroSub     = document.getElementById("hero-sub")
const statsStrip  = document.getElementById("stats-strip")
const filterBar   = document.getElementById("filter-bar")
const sectionHead = document.getElementById("section-head")
const list        = document.getElementById("debate-list")

function renderStats(data) {
  statsStrip.innerHTML = ""
  const timeStr = data.last_scan
    ? new Date(data.last_scan).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })
    : "—"
  ;[
    { label: "Scanned",  value: data.games_scanned || "—" },
    { label: "In 24h",   value: data.games_in_24h  || "—" },
    { label: "Debated",  value: data.games_debated || data.results?.length || "—" },
    { label: "Passed",   value: data.passed         || 0,  cls: "green" },
    { label: "Time",     value: timeStr,                   cls: "amber" },
  ].forEach(s => {
    const b = document.createElement("div")
    b.className = "stat-box"
    b.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls||""}">${s.value}</div>`
    statsStrip.appendChild(b)
  })
}

function buildDebateCard(game, index) {
  const d  = game.debate
  const m  = game.models

  if (!m) return null

  const passed   = d?.passed ?? false
  const strength = d?.strength ?? (passed ? "STRONG" : "NONE")
  const yesCount = d?.yes_count ?? 0
  const totalVotes = d?.total_votes ?? 0
  const avgConf  = d?.avg_confidence ?? 0

  const cardClass = passed ? "passed" : "failed"
  const vClass    = passed ? "pass"   : "fail"
  const vText     = passed ? `✓ PASS (${yesCount}/${totalVotes})` : `✗ FAIL (${yesCount}/${totalVotes})`

  // Model scores strip
  const modelStrip = `
    <div class="model-strip">
      <div class="model-cell"><div class="model-label">XGBoost</div><div class="model-val ${modelColor(m.xgboost?.label)}">${m.xgboost ? (m.xgboost.score*100).toFixed(1)+"%" : "—"}</div></div>
      <div class="model-cell"><div class="model-label">LightGBM</div><div class="model-val ${modelColor(m.lightgbm?.label)}">${m.lightgbm ? (m.lightgbm.score*100).toFixed(1)+"%" : "—"}</div></div>
      <div class="model-cell"><div class="model-label">CatBoost</div><div class="model-val ${modelColor(m.catboost?.label)}">${m.catboost ? (m.catboost.score*100).toFixed(1)+"%" : "—"}</div></div>
      <div class="model-cell"><div class="model-label">Ensemble</div><div class="model-val amber">${m.ensemble ? (m.ensemble*100).toFixed(1)+"%" : "—"}</div></div>
      <div class="model-cell"><div class="model-label">Votes</div><div class="model-val ${(m.votes||0)>=2?"green":"red"}">${m.votes||0}/3</div></div>
      <div class="model-cell"><div class="model-label">Over 2.5</div><div class="model-val">${pct(game.prob_over_25)}</div></div>
      <div class="model-cell"><div class="model-label">BTTS</div><div class="model-val">${pct(game.prob_btts_yes)}</div></div>
    </div>`

  // AI debate rows
  let aiRows = ""
  if (d?.votes) {
    aiRows = Object.entries(d.votes).map(([key, v]) => {
      const voteYes  = v.vote === "YES"
      const voteErr  = v.vote === "ERROR"
      const dotClass = voteYes ? "yes" : voteErr ? "amber" : "no"
      const voteLabel = voteYes ? "YES" : voteErr ? "ERR" : "NO"
      return `
        <div class="fw-ai-row">
          <div class="fw-ai-id">
            <span class="fw-ai-icon">${v.icon || "🤖"}</span>
            <div class="vote-dot ${dotClass}" style="margin:4px auto 2px"></div>
            <span class="fw-ai-verdict ${dotClass}">${voteLabel}</span>
          </div>
          <div class="fw-ai-body">
            <div class="fw-ai-name">${v.name} <span class="fw-ai-conf">${v.confidence}%</span></div>
            <div class="fw-ai-reason">${v.reason || "—"}</div>
            ${v.key_signal ? `<div class="fw-ai-signal">Key: ${v.key_signal}</div>` : ""}
          </div>
        </div>`
    }).join("")
  } else {
    aiRows = `<div class="state-msg" style="padding:16px 0;font-size:0.75rem">Debate not run yet — hit /run-freewill-debate</div>`
  }

  const card = document.createElement("div")
  card.className = `debate-card ${cardClass}`
  card.dataset.filter = passed ? "passed" : "failed"
  card.style.animationDelay = `${Math.min(index, 8) * 70}ms`

  card.innerHTML = `
    <div class="debate-head">
      <div class="debate-match-info">
        <div class="debate-league">${game.league || "Unknown"}</div>
        <div class="debate-match">${game.match || "Unknown"}</div>
        <div class="debate-time">${game.date || ""} · ${game.time || ""}</div>
      </div>
      <div class="verdict-badge">
        <span class="verdict-main ${vClass}">${vText}</span>
        <span class="verdict-conf">${strength} · Avg ${avgConf}%</span>
      </div>
    </div>
    ${modelStrip}
    <div class="fw-debate-panel">
      <div class="panel-title">AI Debate Panel</div>
      ${aiRows}
    </div>
    ${d?.summary ? `<div class="fw-summary">${d.summary}</div>` : ""}`

  return card
}

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

async function init() {
  heroTitle.textContent = "Loading..."

  let games = []
  let meta  = {}
  let source = "none"

  // 1. Try full debate results
  try {
    const d = await safeFetch("/freewill-debate")
    if (d?.results?.length) {
      games  = d.results
      meta   = d
      source = "debate"
    }
  } catch (e) { console.warn("/freewill-debate:", e.message) }

  // 2. Fallback: model-only results
  if (!games.length) {
    try {
      const d = await safeFetch("/freewill-predictions")
      if (d?.top10?.length) {
        games  = d.top10
        meta   = { ...d, results: d.top10, games_debated: 0, passed: d.confirmed || 0 }
        source = "models"
      }
    } catch (e) { console.warn("/freewill-predictions:", e.message) }
  }

  // 3. Nothing
  if (!games.length) {
    heroTitle.textContent = "No data yet"
    heroSub.textContent   = "Hit /run-freewill-debate to populate this page"
    list.innerHTML = `<div class="state-msg"><div class="state-icon">🤖</div>Run the FreeWill engine to see debates here.<br><code>/run-freewill-debate</code></div>`
    return
  }

  const passed = source === "debate"
    ? games.filter(g => g.debate?.passed).length
    : (meta.passed || 0)

  heroTitle.textContent = source === "debate"
    ? `${passed} Pick${passed!==1?"s":""} Passed the AI Debate`
    : `${games.length} Games — Awaiting AI Debate`

  heroSub.textContent = source === "debate"
    ? `Gemini · DeepSeek · GPT-4o · Last: ${new Date(meta.last_scan).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`
    : `Model scores ready — run /run-freewill-debate for full debate`

  renderStats({ ...meta, games_debated: source === "debate" ? games.length : 0, passed })

  sectionHead.style.display = "flex"
  filterBar.style.display   = "flex"

  games.forEach((game, i) => {
    const card = buildDebateCard(game, i)
    if (card) list.appendChild(card)
  })

  initFilters()
}

init()
