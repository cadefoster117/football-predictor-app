// AivsBookie — history.js
// Shows history with WIN/LOSS buttons
// Results saved server-side via /api/result

const analystMeta = {
  statistics: { icon: "📊", label: "Stats Analyst" },
  form:       { icon: "📈", label: "Form Analyst"  },
  value:      { icon: "💰", label: "Value Analyst" }
}

function pct(v) { return v != null ? (v * 100).toFixed(1) + "%" : "—" }

// Load history from localStorage
const historyData = JSON.parse(localStorage.getItem("history") || "[]")

const heroTitle   = document.getElementById("hero-title")
const heroSub     = document.getElementById("hero-sub")
const statsStrip  = document.getElementById("stats-strip")
const sectionHead = document.getElementById("section-head")
const listEl      = document.getElementById("history-list")

// Load server-side results, then render
async function init() {
  let serverResults = {}
  try {
    const res = await fetch("/api/results")
    if (res.ok) serverResults = await res.json()
  } catch {}

  // Merge server results into history entries
  const merged = historyData.map(h => {
    const key = h.match + "|" + h.date
    if (serverResults[key]) return { ...h, result: serverResults[key].result }
    return h
  })

  const total     = merged.length
  const confirmed = merged.filter(h => h.ai?.consensus).length
  const wins      = merged.filter(h => h.result === "WIN").length
  const losses    = merged.filter(h => h.result === "LOSS").length
  const pending   = merged.filter(h => !h.result || h.result === "VOID").length

  heroTitle.textContent = total === 0 ? "No history yet"
    : `${total} Prediction${total !== 1 ? "s" : ""} Logged`

  heroSub.textContent = total > 0
    ? `${confirmed} confirmed · ${wins} wins · ${losses} losses · ${pending} pending`
    : "Picks from Today page are saved here automatically"

  if (total > 0) {
    [
      { label: "Total",     value: total,     cls: "" },
      { label: "Confirmed", value: confirmed, cls: "" },
      { label: "Wins",      value: wins,      cls: "" },
      { label: "Losses",    value: losses,    cls: "red" },
      { label: "Pending",   value: pending,   cls: "amber" },
    ].forEach(s => {
      const b = document.createElement("div")
      b.className = "stat-box"
      b.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls}">${s.value}</div>`
      statsStrip.appendChild(b)
    })
    sectionHead.style.display = "flex"
  }

  if (total === 0) {
    const msg = document.createElement("div")
    msg.className = "state-msg"
    msg.innerHTML = `<div class="state-icon">📂</div>No history yet.<br>Confirmed picks from the Today page are saved here automatically.`
    listEl.appendChild(msg)
    return
  }

  merged.forEach((h, i) => renderCard(h, i))
}

function buildVotesHTML(votes) {
  if (!votes) return ""
  const rows = Object.entries(votes).map(([key, v]) => {
    const meta = analystMeta[key] || { icon: "🤖", label: key }
    const cls  = v.vote === "YES" ? "yes" : "no"
    return `<div class="vote-row">
      <div class="vote-indicator">
        <div class="vote-dot ${cls}"></div>
        <div class="vote-verdict ${cls}">${v.vote}</div>
      </div>
      <div class="vote-body">
        <div class="vote-analyst">${meta.icon} ${meta.label}</div>
        <div class="vote-reason">${v.reason || "—"}</div>
      </div>
    </div>`
  }).join("")
  return `<div class="votes-wrap"><div class="votes-title">AI Analyst Panel</div>${rows}</div>`
}

// Save result to server + update card
async function setResult(key, result, card) {
  try {
    await fetch("/api/result", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ key, result })
    })
    // Update button states
    const cls = result === "WIN" ? "win" : result === "LOSS" ? "loss" : "tbd"
    const txt = result === "WIN" ? "WIN ✓" : result === "LOSS" ? "LOSS ✗" : "PENDING"
    const badge = card.querySelector(".result-badge")
    if (badge) {
      badge.className = `result-badge ${cls}`
      badge.textContent = txt
    }
    // Update buttons
    card.querySelectorAll(".result-btn").forEach(btn => btn.classList.remove("active"))
    const activeBtn = card.querySelector(`[data-result="${result}"]`)
    if (activeBtn) activeBtn.classList.add("active")
  } catch (err) {
    console.error("Failed to save result:", err)
  }
}

function renderCard(h, i) {
  const over  = h.probability?.over25
  const btts  = h.probability?.btts
  const combo = h.probability?.combo
  const hasAI    = h.ai && h.ai.votes
  const consensus = h.ai?.consensus
  const key = h.match + "|" + h.date

  const badgeClass = consensus ? "badge-confirmed" : hasAI ? "badge-rejected" : "badge-pending"
  const badgeText  = consensus ? "✓ CONFIRMED"    : hasAI ? "✗ REJECTED"    : "UNSCANNED"

  const resultClass = h.result === "WIN"  ? "win"
                    : h.result === "LOSS" ? "loss" : "tbd"
  const resultText  = h.result === "WIN"  ? "WIN ✓"
                    : h.result === "LOSS" ? "LOSS ✗" : "PENDING"

  const scoreLine = h.most_likely_score
    ? `<div class="prob-cell"><div class="prob-label">Likely Score</div><div class="prob-val blue">${h.most_likely_score}</div></div>` : ""

  const savedAt = h.saved_at ? new Date(h.saved_at).toLocaleDateString() : ""

  const card = document.createElement("div")
  card.className = "card"
  card.style.animationDelay = `${Math.min(i, 12) * 60}ms`

  card.innerHTML = `
    <div class="card-head">
      <div class="card-left">
        <div class="card-league">${h.league || "Unknown"}</div>
        <div class="card-match">${h.match || "Unknown"}</div>
        <div class="card-time">${h.date || ""}${h.time ? " · " + h.time : ""}${savedAt ? " · Saved " + savedAt : ""}</div>
      </div>
      <div class="badge ${badgeClass}">${badgeText}</div>
    </div>
    <div class="prob-row">
      <div class="prob-cell"><div class="prob-label">Over 2.5</div><div class="prob-val">${pct(over)}</div></div>
      <div class="prob-cell"><div class="prob-label">BTTS</div><div class="prob-val">${pct(btts)}</div></div>
      <div class="prob-cell"><div class="prob-label">Combo</div><div class="prob-val amber">${pct(combo)}</div></div>
      ${scoreLine}
    </div>
    ${buildVotesHTML(h.ai?.votes)}
    <div class="card-foot">
      <div class="result-buttons">
        <button class="result-btn win-btn ${h.result === "WIN" ? "active" : ""}" data-result="WIN">✓ WIN</button>
        <button class="result-btn loss-btn ${h.result === "LOSS" ? "active" : ""}" data-result="LOSS">✗ LOSS</button>
        <button class="result-btn void-btn ${!h.result ? "active" : ""}" data-result="VOID">— VOID</button>
      </div>
      <span class="result-badge ${resultClass}">${resultText}</span>
    </div>`

  // Wire up buttons
  card.querySelectorAll(".result-btn").forEach(btn => {
    btn.addEventListener("click", () => setResult(key, btn.dataset.result, card))
  })

  listEl.appendChild(card)
}

init()
