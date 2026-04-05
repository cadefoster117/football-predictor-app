// AivsBookie — index.js

const analystMeta = {
  statistics: { icon: "📊", label: "Stats Analyst" },
  form:       { icon: "📈", label: "Form Analyst"  },
  value:      { icon: "💰", label: "Value Analyst" }
}

function pct(v) { return v != null ? (v * 100).toFixed(1) + "%" : "—" }
function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls)  e.className = cls
  if (html) e.innerHTML = html
  return e
}

// Save confirmed picks to localStorage (no duplicates)
function saveToHistory(predictions) {
  const existing = JSON.parse(localStorage.getItem("history") || "[]")
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
  localStorage.setItem("history", JSON.stringify(existing.slice(0, 200)))
  return added
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
  return `<div class="votes-wrap"><div class="votes-title">AI Analyst Panel</div><div class="votes-grid">${rows}</div></div>`
}

function buildCard(p, index) {
  const over  = p.probability?.over25
  const btts  = p.probability?.btts
  const combo = p.probability?.combo
  const hasAI    = p.ai && p.ai.votes
  const consensus = p.ai?.consensus
  const badgeClass = consensus ? "badge-confirmed" : hasAI ? "badge-rejected" : "badge-pending"
  const badgeText  = consensus ? "✓ CONFIRMED"    : hasAI ? "✗ REJECTED"    : "UNSCANNED"
  const scoreLine  = p.most_likely_score
    ? `<div class="prob-cell"><div class="prob-label">Likely Score</div><div class="prob-val blue">${p.most_likely_score}</div></div>` : ""
  const confLine   = p.confidence != null
    ? `<div class="prob-cell"><div class="prob-label">Confidence</div><div class="prob-val">${(p.confidence*100).toFixed(0)}%</div></div>` : ""

  const card = document.createElement("div")
  card.className = "card"
  card.style.animationDelay = `${index * 80}ms`
  card.innerHTML = `
    <div class="card-head">
      <div class="card-left">
        <div class="card-league">${p.league || "Unknown"}</div>
        <div class="card-match">${p.match || "Unknown"}</div>
        <div class="card-time">${p.date || ""}${p.time ? " · " + p.time : ""}</div>
      </div>
      <div class="badge ${badgeClass}">${badgeText}</div>
    </div>
    <div class="prob-row">
      <div class="prob-cell"><div class="prob-label">Over 2.5</div><div class="prob-val">${pct(over)}</div></div>
      <div class="prob-cell"><div class="prob-label">BTTS</div><div class="prob-val">${pct(btts)}</div></div>
      <div class="prob-cell"><div class="prob-label">Combo</div><div class="prob-val amber">${pct(combo)}</div></div>
      ${scoreLine}${confLine}
    </div>
    ${buildVotesHTML(p.ai?.votes)}
    <div class="card-foot">
      <span class="foot-label">Bet: Over 2.5 & BTTS</span>
      <span class="result-badge tbd">PENDING</span>
    </div>`
  return card
}

function renderStats(data) {
  const strip = document.getElementById("stats-strip")
  strip.innerHTML = ""
  const stats = [
    { label: "Scanned",    value: data.games_scanned || 0 },
    { label: "Candidates", value: data.candidates    || 0 },
    { label: "Confirmed",  value: data.ai_confirmed  || 0 },
    { label: "Scan Time",  value: data.last_scan
        ? new Date(data.last_scan).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) : "—",
      cls: "amber" },
  ]
  stats.forEach(s => {
    const b = document.createElement("div")
    b.className = "stat-box"
    b.innerHTML = `<div class="s-label">${s.label}</div><div class="s-value ${s.cls||""}">${s.value}</div>`
    strip.appendChild(b)
  })
}

async function init() {
  const heroTitle   = document.getElementById("hero-title")
  const scanTime    = document.getElementById("scan-time")
  const picksHead   = document.getElementById("picks-head")
  const picksList   = document.getElementById("picks-list")
  const accaSection = document.getElementById("acca-section")

  try {
    const res = await fetch("/predictions")
    if (!res.ok) throw new Error("Engine not connected")
    const data = await res.json()
    const confirmed = (data.predictions || []).filter(p => p.ai?.consensus)

    heroTitle.textContent = confirmed.length > 0
      ? `${confirmed.length} Pick${confirmed.length !== 1 ? "s" : ""} for Today`
      : "No confirmed picks today"

    if (data.last_scan)
      scanTime.textContent = "Last scan: " + new Date(data.last_scan).toLocaleString()

    renderStats(data)

    if (confirmed.length > 0) saveToHistory(confirmed)

    if (confirmed.length === 0) {
      picksHead.style.display = "none"
      picksList.appendChild(el("div","state-msg",
        `<div class="state-icon">🔍</div>No picks passed the AI triple-check today.<br>All 3 analysts must agree for a pick to show here.`))
      return
    }

    // Simple acca banner using confirmed picks
    if (confirmed.length >= 2) {
      const top3 = confirmed.slice(0, 3)
      const avgCombo = top3.reduce((s,p) => s + (p.probability?.combo||0), 0) / top3.length
      const section = document.createElement("div")
      section.innerHTML = `
        <div class="acca-banner">
          <div>
            <div class="acca-label">// Today's Accumulator</div>
            <div class="acca-picks">${top3.map(p => p.match).join(" · ")}</div>
          </div>
          <div class="acca-score">${pct(Math.pow(avgCombo, top3.length))}</div>
        </div>
        <div class="section-head">AI Confirmed Picks</div>`
      accaSection.appendChild(section)
    } else {
      picksHead.style.display = "flex"
    }

    confirmed.forEach((p, i) => picksList.appendChild(buildCard(p, i)))

  } catch (err) {
    heroTitle.textContent = "Engine not connected"
    scanTime.textContent  = err.message
    picksList.appendChild(el("div","state-msg",
      `<div class="state-icon">⚙️</div>Run <code>node engine.js</code> to generate predictions.`))
  }
}

init()
