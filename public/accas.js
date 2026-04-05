// AivsBookie — accas.js

const ACCA_COLORS = { safe: "green", value: "amber", bold: "red" }

function renderAcca(acca) {
  if (!acca) return ""
  const color = ACCA_COLORS[acca.type] || "green"

  if (acca.error || !acca.selections?.length) {
    return `
      <div class="acca-block">
        <div class="acca-block-header">
          <div>
            <div class="acca-block-title" style="color:var(--${color})">${acca.label || "Accumulator"}</div>
            <div class="acca-block-sub">Could not generate</div>
          </div>
        </div>
        <div style="padding:20px;font-family:var(--mono);font-size:0.75rem;color:var(--text-dim)">
          ${acca.summary || "Try /run-accas to regenerate"}
        </div>
      </div>`
  }

  const picks = acca.selections.map((s, i) => `
    <div class="acca-pick-row">
      <div class="acca-pick-num">${i + 1}</div>
      <div class="acca-pick-info">
        <div class="acca-pick-league">${s.league || ""}</div>
        <div class="acca-pick-match">${s.match || "Unknown"}</div>
        <div class="acca-pick-time">${s.kickoff ? "⏰ " + s.kickoff : ""}</div>
        <div class="acca-pick-reason">${s.reason || ""}</div>
      </div>
      <div class="acca-pick-market">
        <div class="acca-market-name">${s.bet || "—"}</div>
        <div class="acca-market-prob" style="color:var(--${color})">${s.estimated_odds ? s.estimated_odds + "x" : "—"}</div>
      </div>
    </div>`).join("")

  return `
    <div class="acca-block">
      <div class="acca-block-header">
        <div>
          <div class="acca-block-title" style="color:var(--${color})">${acca.label}</div>
          <div class="acca-block-sub">${acca.selections.length} selections · DeepSeek AI · ${acca.date || ""}</div>
        </div>
        <div class="acca-block-odds">
          <div class="acca-odds-val" style="color:var(--${color})">${acca.estimated_total_odds}x</div>
          <div class="acca-odds-label">total odds</div>
        </div>
      </div>
      <div class="acca-picks-list">${picks}</div>
      <div class="acca-footer">
        <div class="acca-combined">${acca.summary || ""}</div>
        <div class="acca-warning">⚠ AI estimates only — always verify with bookmaker</div>
      </div>
    </div>`
}

async function init() {
  const heroTitle = document.getElementById("hero-title")
  const heroSub   = document.getElementById("hero-sub")
  const strip     = document.getElementById("stats-strip")
  const container = document.getElementById("accas-container")

  try {
    const res = await fetch("/api/accas")
    if (!res.ok) throw new Error("No accas data — status " + res.status)
    const data = await res.json()

    if (!data.accas?.length) {
      heroTitle.textContent = "No accas yet"
      heroSub.textContent   = "Generated once per day at midnight Sofia time"
      container.innerHTML = `<div class="state-msg">
        <div class="state-icon">📋</div>
        Accas are generated once per day by DeepSeek AI.<br>
        Trigger manually: <code>/run-accas</code>
      </div>`
      return
    }

    const scanTime = new Date(data.last_scan).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })
    heroTitle.textContent = `Today's Accumulators`
    heroSub.textContent   = `${data.date_label || ""} · DeepSeek AI · Updated ${scanTime}`

    // Stats
    data.accas.forEach(a => {
      const color = ACCA_COLORS[a.type] || "green"
      const b = document.createElement("div")
      b.className = "stat-box"
      b.innerHTML = `
        <div class="s-label">${a.type?.toUpperCase() || "ACCA"}</div>
        <div class="s-value ${color}">${a.error ? "ERR" : (a.estimated_total_odds || "?") + "x"}</div>`
      strip.appendChild(b)
    })

    const titles = {
      safe:  "Safe Accumulator (~2.00 odds)",
      value: "Value Accumulator (~5.00 odds)",
      bold:  "Bold Accumulator (~10.00 odds)"
    }

    container.innerHTML = data.accas.map(acca =>
      `<div class="section-head">${titles[acca.type] || "Accumulator"}</div>${renderAcca(acca)}`
    ).join("")

    if (!document.getElementById("acca-extra-style")) {
      const s = document.createElement("style")
      s.id = "acca-extra-style"
      s.textContent = `
        .acca-pick-reason { font-family:var(--sans); font-size:0.8rem; color:var(--text-dim); margin-top:3px; font-style:italic; }
        .acca-pick-time   { font-family:var(--mono); font-size:0.62rem; color:var(--text-mid); margin-top:2px; }
      `
      document.head.appendChild(s)
    }

  } catch (err) {
    heroTitle.textContent = "Error loading accas"
    container.innerHTML = `<div class="state-msg"><div class="state-icon">⚙️</div>${err.message}</div>`
  }
}

init()
