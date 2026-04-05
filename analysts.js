// ══════════════════════════════════════════
//  AivsBookie — analysts.js
//  Pure JS analyst logic — no API needed.
// ══════════════════════════════════════════

// ── Analyst 1: Statistics ─────────────────

function statsAnalyst(p) {
  const over  = p.probability.over25 * 100
  const btts  = p.probability.btts   * 100
  const combo = p.probability.combo  * 100

  if (over  < 55) return { vote: "NO", reason: `Over 2.5 too low at ${over.toFixed(1)}% — needs 55%+` }
  if (btts  < 50) return { vote: "NO", reason: `BTTS too low at ${btts.toFixed(1)}% — needs 50%+` }
  if (combo < 28) return { vote: "NO", reason: `Combined score ${combo.toFixed(1)}% below 28% threshold` }

  if (p.confidence != null && p.confidence < 0.5) {
    return { vote: "NO", reason: `Model confidence too low at ${(p.confidence * 100).toFixed(0)}%` }
  }

  return {
    vote:   "YES",
    reason: `Strong numbers — Over2.5 ${over.toFixed(1)}%, BTTS ${btts.toFixed(1)}%, combo ${combo.toFixed(1)}%`
  }
}

// ── Analyst 2: Form & Context ─────────────

function formAnalyst(p) {
  const over = p.probability.over25 * 100
  const btts = p.probability.btts   * 100

  if (p.xg_home != null && p.xg_away != null) {
    const total = p.xg_home + p.xg_away

    if (p.xg_home < 0.7) return { vote: "NO", reason: `Home xG too low (${p.xg_home.toFixed(2)}) — unlikely to score` }
    if (p.xg_away < 0.7) return { vote: "NO", reason: `Away xG too low (${p.xg_away.toFixed(2)}) — unlikely to score` }
    if (total    < 2.2)  return { vote: "NO", reason: `Total xG ${total.toFixed(2)} suggests a low-scoring game` }

    return {
      vote:   "YES",
      reason: `Both teams threaten — xG home ${p.xg_home.toFixed(2)}, away ${p.xg_away.toFixed(2)}, total ${total.toFixed(2)}`
    }
  }

  // No xG — stricter fallback
  if (over < 58 || btts < 52) {
    return { vote: "NO", reason: `No xG data — stricter thresholds applied (need 58%/52%)` }
  }

  return {
    vote:   "YES",
    reason: `No xG data but probabilities strong enough — Over2.5 ${over.toFixed(1)}%, BTTS ${btts.toFixed(1)}%`
  }
}

// ── Analyst 3: Value & Risk ───────────────

function valueAnalyst(p) {
  const over  = p.probability.over25 * 100
  const btts  = p.probability.btts   * 100
  const combo = p.probability.combo  * 100

  // Heavy favourite = likely clean sheet
  if (p.favorite_prob != null && p.favorite_prob > 72) {
    return { vote: "NO", reason: `Heavy favourite at ${p.favorite_prob.toFixed(0)}% — likely one-sided, low BTTS chance` }
  }

  // Most likely score check
  if (p.most_likely_score) {
    const parts = p.most_likely_score.split("-").map(Number)
    if (parts.length === 2) {
      const [h, a] = parts
      if (a === 0 || h === 0) return { vote: "NO", reason: `Likely score ${p.most_likely_score} suggests clean sheet — BTTS unlikely` }
      if (h + a < 2)          return { vote: "NO", reason: `Likely score ${p.most_likely_score} predicts under 2 goals` }
    }
  }

  if (combo < 30) return { vote: "NO", reason: `Combo ${combo.toFixed(1)}% too low to justify double bet risk` }
  if (over  < 55 || btts < 52) {
    return { vote: "NO", reason: `Marginal markets — Over2.5 ${over.toFixed(1)}%, BTTS ${btts.toFixed(1)}%` }
  }

  return {
    vote:   "YES",
    reason: `Good value — no red flags, combo ${combo.toFixed(1)}% justifies the bet`
  }
}

// ── Ensemble runner ───────────────────────

function runEnsemble(prediction) {
  const stats = statsAnalyst(prediction)
  const form  = formAnalyst(prediction)
  const value = valueAnalyst(prediction)

  return {
    ...prediction,
    ai: {
      consensus: stats.vote === "YES" && form.vote === "YES" && value.vote === "YES",
      votes: { statistics: stats, form, value }
    }
  }
}

module.exports = { runEnsemble, statsAnalyst, formAnalyst, valueAnalyst }
