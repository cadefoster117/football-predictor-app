// ══════════════════════════════════════════
//  AivsBookie — history.js
//  Reads localStorage history → renders all
//  saved predictions with AI analyst votes
// ══════════════════════════════════════════

const analystMeta = {
  statistics: { icon: "📊", label: "Stats Analyst" },
  form:       { icon: "📈", label: "Form Analyst"  },
  value:      { icon: "💰", label: "Value Analyst" }
}

function pct(v) {
  return v != null ? (v * 100).toFixed(1) + "%" : "—"
}

// ── Load ──────────────────────────────────

const historyData = JSON.parse(localStorage.getItem("history") || "[]")

const heroTitle  = document.getElementById("hero-title")
const heroSub    = document.getElementById("hero-sub")
const statsStrip = document.getElementById("stats-strip")
const sectionHead = document.getElementById("section-head")
const listEl     = document.getElementById("history-list")

// ── Stats ─────────────────────────────────

const total     = historyData.length
const confirmed = historyData.filter(h => h.ai?.consensus).length
const wins      = historyData.filter(h => h.result === "WIN").length
const losses    = historyData.filter(h => h.result === "LOSS").length
const pending   = historyData.filter(h => !h.result).length

heroTitle.textContent = total === 0
  ? "No history yet"
  : `${total} Prediction${total !== 1 ? "s" : ""} Logged`

heroSub.textContent = total > 0
  ? `${confirmed} confirmed · ${wins} wins · ${losses} losses · ${pending} pending`
  : "Run engine.js to start building your prediction log"

if (total > 0) {
  const stats = [
    { label: "Total",     value: total,     cls: "" },
    { label: "Confirmed", value: confirmed, cls: "" },
    { label: "Wins",      value: wins,      cls: "" },
    { label: "Losses",    value: losses,    cls: "red" },
    { label: "Pending",   value: pending,   cls: "amber" },
  ]

  stats.forEach(s => {
    const box = document.createElement("div")
    box.className = "stat-box"
    box.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls}">${s.value}</div>`
    statsStrip.appendChild(box)
  })

  sectionHead.style.display = "flex"
}

// ── Empty state ───────────────────────────

if (total === 0) {
  const msg = document.createElement("div")
  msg.className = "state-msg"
  msg.innerHTML = `<div class="state-icon">📂</div>No history yet.<br>Run <code>node engine.js</code>, then visit the Today page to populate your log.`
  listEl.appendChild(msg)
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
      ${rows}
    </div>`
}

// ── Render cards ──────────────────────────

historyData.forEach((h, i) => {
  const over  = h.probability?.over25
  const btts  = h.probability?.btts
  const combo = h.probability?.combo

  const hasAI     = h.ai && h.ai.votes
  const consensus = h.ai?.consensus

  const badgeClass = consensus ? "badge-confirmed"
                   : hasAI     ? "badge-rejected"
                   :             "badge-pending"
  const badgeText  = consensus ? "✓ CONFIRMED"
                   : hasAI     ? "✗ REJECTED"
                   :             "UNSCANNED"

  const resultClass =
    h.result === "WIN"  ? "win"  :
    h.result === "LOSS" ? "loss" : "tbd"
  const resultText = h.result || "PENDING"

  const scoreLine = h.most_likely_score
    ? `<div class="prob-cell"><div class="prob-label">Likely Score</div><div class="prob-val blue">${h.most_likely_score}</div></div>`
    : ""

  const savedAt = h.saved_at
    ? new Date(h.saved_at).toLocaleDateString()
    : ""

  const card = document.createElement("div")
  card.className = "card"
  card.style.animationDelay = `${Math.min(i, 12) * 60}ms`

  card.innerHTML = `
    <div class="card-head">
      <div class="card-left">
        <div class="card-league">${h.league || "Unknown League"}</div>
        <div class="card-match">${h.match || "Unknown Match"}</div>
        <div class="card-time">${h.date || ""}${h.time ? " · " + h.time : ""}${savedAt ? " · Saved " + savedAt : ""}</div>
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
    </div>

    ${buildVotesHTML(h.ai?.votes)}

    <div class="card-foot">
      <span class="foot-label">Over 2.5 & BTTS</span>
      <span class="result-badge ${resultClass}">${resultText}</span>
    </div>
  `

  listEl.appendChild(card)
})
