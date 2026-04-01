// ══════════════════════════════════════════
//  AivsBookie — index.js
//  Loads predictions.json → renders picks
//  Saves confirmed picks to localStorage history
// ══════════════════════════════════════════

const analystMeta = {
  statistics: { icon: "📊", label: "Stats Analyst" },
  form:       { icon: "📈", label: "Form Analyst"  },
  value:      { icon: "💰", label: "Value Analyst" }
}

// ── Helpers ──────────────────────────────

function pct(v) {
  return v != null ? (v * 100).toFixed(1) + "%" : "—"
}

function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls)  e.className = cls
  if (html) e.innerHTML = html
  return e
}

// ── Save to history in localStorage ──────

function saveToHistory(predictions) {
  const existing = JSON.parse(localStorage.getItem("history") || "[]")

  // Avoid duplicates by match+date key
  const keys = new Set(existing.map(h => h.match + "|" + h.date))

  let added = 0
  for (const p of predictions) {
    const key = p.match + "|" + p.date
    if (!keys.has(key)) {
      existing.unshift({ ...p, saved_at: new Date().toISOString() })
      keys.add(key)
      added++
    }
  }

  // Keep max 200 entries
  const trimmed = existing.slice(0, 200)
  localStorage.setItem("history", JSON.stringify(trimmed))

  return added
}

// ── Build vote rows HTML ──────────────────

function buildVotesHTML(votes) {
  if (!votes) return ""

  const rows = Object.entries(votes).map(([key, v]) => {
    const meta      = analystMeta[key] || { icon: "🤖", label: key }
    const voteClass = v.vote === "YES" ? "yes" : "no"
    return `
      <div class="vote-row">
        <div class="vote-indicator">
          <div class="vote-dot ${voteClass}"></div>
          <div class="vote-verdict ${voteClass}">${v.vote}</div>
        </div>
        <div class="vote-body">
          <div class="vote-analyst">${meta.icon} ${meta.label}</div>
          <div class="vote-reason">${v.reason || "—"}</div>
        </div>
      </div>`
  }).join("")

  return `
    <div class="votes-wrap">
      <div class="votes-title">AI Analyst Panel</div>
      <div class="votes-grid">${rows}</div>
    </div>`
}

// ── Build a single prediction card ───────

function buildCard(p, index) {
  const over  = p.probability?.over25
  const btts  = p.probability?.btts
  const combo = p.probability?.combo

  const hasAI     = p.ai && p.ai.votes
  const consensus = p.ai?.consensus

  const badgeClass = consensus ? "badge-confirmed"
                   : hasAI     ? "badge-rejected"
                   :             "badge-pending"
  const badgeText  = consensus ? "✓ CONFIRMED"
                   : hasAI     ? "✗ REJECTED"
                   :             "UNSCANNED"

  const votesHTML = buildVotesHTML(p.ai?.votes)

  const scoreLine = p.most_likely_score
    ? `<div class="prob-cell"><div class="prob-label">Likely Score</div><div class="prob-val blue">${p.most_likely_score}</div></div>`
    : ""

  const confLine = p.confidence != null
    ? `<div class="prob-cell"><div class="prob-label">Confidence</div><div class="prob-val">${(p.confidence * 100).toFixed(0)}%</div></div>`
    : ""

  const card = document.createElement("div")
  card.className = "card"
  card.style.animationDelay = `${index * 80}ms`

  card.innerHTML = `
    <div class="card-head">
      <div class="card-left">
        <div class="card-league">${p.league || "Unknown League"}</div>
        <div class="card-match">${p.match || "Unknown Match"}</div>
        <div class="card-time">${p.date || ""}${p.time ? " · " + p.time : ""}</div>
      </div>
      <div class="badge ${badgeClass}">${badgeText}</div>
    </div>

    <div class="prob-row">
      <div class="prob-cell">
        <div class="prob-label">Over 2.5</div>
        <div class="prob-val">${pct(over)}</div>
      </div>
      <div class="prob-cell">
        <div class="prob-label">BTTS</div>
        <div class="prob-val">${pct(btts)}</div>
      </div>
      <div class="prob-cell">
        <div class="prob-label">Combo</div>
        <div class="prob-val amber">${pct(combo)}</div>
      </div>
      ${scoreLine}
      ${confLine}
    </div>

    ${votesHTML}

    <div class="card-foot">
      <span class="foot-label">Bet: Over 2.5 & BTTS</span>
      <span class="result-badge tbd">PENDING</span>
    </div>
  `

  return card
}

// ── Build accumulator banner ──────────────

function buildAccaBanner(confirmed) {
  if (confirmed.length < 2) return null

  const top3 = confirmed.slice(0, 3)
  const avgCombo = top3.reduce((s, p) => s + (p.probability?.combo || 0), 0) / top3.length
  const matchList = top3.map(p => p.match.split(" vs ")[0] + " & co.").join(", ")

  const section = document.createElement("div")
  section.innerHTML = `
    <div class="acca-banner">
      <div>
        <div class="acca-label">// Today's Accumulator</div>
        <div class="acca-picks">${top3.map(p => p.match).join(" · ")}</div>
      </div>
      <div class="acca-score">${pct(Math.pow(avgCombo, top3.length))}</div>
    </div>
    <div class="section-head">AI Confirmed Picks</div>
  `
  return section
}

// ── Render stats strip ────────────────────

function renderStats(data) {
  const strip = document.getElementById("stats-strip")
  strip.innerHTML = ""

  const stats = [
    { label: "Scanned",   value: data.games_scanned  || 0,            cls: "" },
    { label: "Candidates",value: data.candidates      || 0,            cls: "" },
    { label: "Confirmed", value: data.ai_confirmed    || 0,            cls: "" },
    { label: "Scan Time", value: data.last_scan
        ? new Date(data.last_scan).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "—",                                                          cls: "amber" },
  ]

  stats.forEach(s => {
    const box = document.createElement("div")
    box.className = "stat-box"
    box.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls}">${s.value}</div>`
    strip.appendChild(box)
  })
}

// ── Main ──────────────────────────────────

async function init() {
  const heroTitle  = document.getElementById("hero-title")
  const heroMeta   = document.getElementById("hero-meta")
  const scanTime   = document.getElementById("scan-time")
  const picksHead  = document.getElementById("picks-head")
  const picksList  = document.getElementById("picks-list")
  const accaSection = document.getElementById("acca-section")

  try {
    const res = await fetch("/predictions")
    
    if (!res.ok) throw new Error("predictions.json not found — run engine.js first")

    const data = await res.json()
    const confirmed = (data.predictions || []).filter(p => p.ai?.consensus)

    // ── Hero
    heroTitle.textContent = confirmed.length > 0
      ? `${confirmed.length} Pick${confirmed.length !== 1 ? "s" : ""} for Today`
      : "No confirmed picks today"

    if (data.last_scan) {
      scanTime.textContent = "Last scan: " + new Date(data.last_scan).toLocaleString()
    }

    // ── Stats
    renderStats(data)

    // ── Save confirmed picks to history
    if (confirmed.length > 0) {
      const added = saveToHistory(confirmed)
      if (added > 0) console.log(`[AivsBookie] ${added} new pick(s) saved to history`)
    }

    // ── Empty state
    if (confirmed.length === 0) {
      picksHead.style.display = "none"
      const msg = el("div", "state-msg")
      msg.innerHTML = `<div class="state-icon">🔍</div>No picks passed the AI triple-check today.<br>All 3 analysts must agree for a pick to show here.`
      picksList.appendChild(msg)
      return
    }

    // ── Accumulator banner
    const banner = buildAccaBanner(confirmed)
    if (banner) accaSection.appendChild(banner)
    else picksHead.style.display = "flex"

    // ── Cards
    confirmed.forEach((p, i) => {
      picksList.appendChild(buildCard(p, i))
    })

  } catch (err) {
    heroTitle.textContent = "Engine not connected"
    document.getElementById("scan-time").textContent = err.message

    const msg = el("div", "state-msg")
    msg.innerHTML = `<div class="state-icon">⚙️</div>Run <code>node engine.js</code> to generate predictions.json<br>then reload this page.`
    picksList.appendChild(msg)
  }
}

init()
