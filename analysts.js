// ══════════════════════════════════════════
//  AivsBookie — analysts.js
//  Pure JS analyst logic — no API needed.
//  Each analyst mirrors the Claude persona
//  but runs entirely locally.
// ══════════════════════════════════════════

// ── Analyst 1: Statistics ─────────────────
// Cold, data-driven. Only trusts numbers.
// Strict thresholds on over25 and btts.

function statsAnalyst(p) {
  const over  = p.probability.over25 * 100
  const btts  = p.probability.btts   * 100
  const combo = p.probability.combo  * 100

  // Both must be individually strong
  if (over  < 55) return { vote: "NO", reason: `Over 2.5 probability too low at ${over.toFixed(1)}% — needs 55%+` }
  if (btts  < 50) return { vote: "NO", reason: `BTTS probability too low at ${btts.toFixed(1)}% — needs 50%+` }
  if (combo < 28) return { vote: "NO", reason: `Combined score ${combo.toFixed(1)}% is below the 28% threshold` }

  // Extra confidence boost check
  if (p.confidence != null && p.confidence < 0.5) {
    return { vote: "NO", reason: `Model confidence too low at ${(p.confidence * 100).toFixed(0)}% — needs 50%+` }
  }

  return {
    vote:   "YES",
    reason: `Strong numbers: Over2.5 ${over.toFixed(1)}%, BTTS ${btts.toFixed(1)}%, combo ${combo.toFixed(1)}%`
  }
}

// ── Analyst 2: Form & Context ─────────────
// Looks at expected goals and match context.
// Needs both teams to be goal threats.

function formAnalyst(p) {
  const xgHome = p.xg_home
  const xgAway = p.xg_away
  const over   = p.probability.over25 * 100
  const btts   = p.probability.btts   * 100

  // If we have xG data, use it as the primary signal
  if (xgHome != null && xgAway != null) {
    const totalXg = xgHome + xgAway

    if (xgHome < 0.7) {
      return { vote: "NO", reason: `Home team xG too low (${xgHome.toFixed(2)}) — unlikely to score` }
    }
    if (xgAway < 0.7) {
      return { vote: "NO", reason: `Away team xG too low (${xgAway.toFixed(2)}) — unlikely to score` }
    }
    if (totalXg < 2.2) {
      return { vote: "NO", reason: `Total xG ${totalXg.toFixed(2)} suggests a low-scoring game` }
    }

    return {
      vote:   "YES",
      reason: `Both teams have attacking threat — xG home ${xgHome.toFixed(2)}, away ${xgAway.toFixed(2)}, total ${totalXg.toFixed(2)}`
    }
  }

  // Fallback: no xG data — rely on probabilities
  if (over < 58 || btts < 52) {
    return {
      vote:   "NO",
      reason: `No xG data available — applying stricter probability thresholds (need 58%/52%)`
    }
  }

  return {
    vote:   "YES",
    reason: `No xG data but probabilities are strong enough: Over2.5 ${over.toFixed(1)}%, BTTS ${btts.toFixed(1)}%`
  }
}

// ── Analyst 3: Value & Risk ───────────────
// Most skeptical. Looks for red flags.
// Checks score line, result lean, and combo.

function valueAnalyst(p) {
  const over  = p.probability.over25 * 100
  const btts  = p.probability.btts   * 100
  const combo = p.probability.combo  * 100

  // Red flag: heavy favourite — likely a 1-0 or 2-0 win, not BTTS
  if (p.predicted_result === "H" || p.predicted_result === "A") {
    const favProb = p.favorite_prob || null
    if (favProb != null && favProb > 72) {
      return {
        vote:   "NO",
        reason: `Heavy favourite (${favProb.toFixed(0)}% win prob) — likely one-sided, low BTTS chance`
      }
    }
  }

  // Red flag: likely score suggests low goals or clean sheet
  if (p.most_likely_score) {
    const parts = p.most_likely_score.split("-").map(Number)
    if (parts.length === 2) {
      const [h, a] = parts
      const total  = h + a

      if (a === 0 || h === 0) {
        return {
          vote:   "NO",
          reason: `Most likely score ${p.most_likely_score} suggests a clean sheet — BTTS unlikely`
        }
      }
      if (total < 2) {
        return {
          vote:   "NO",
          reason: `Most likely score ${p.most_likely_score} predicts under 2 goals — poor value`
        }
      }
    }
  }

  // Combo must be genuinely high to be worth the double-bet risk
  if (combo < 30) {
    return {
      vote:   "NO",
      reason: `Combo score ${combo.toFixed(1)}% is too low to justify a double bet — risk outweighs value`
    }
  }

  // Both must be above value thresholds
  if (over < 55 || btts < 52) {
    return {
      vote:   "NO",
      reason: `One or both markets are marginal — Over2.5 ${over.toFixed(1)}%, BTTS ${btts.toFixed(1)}%`
    }
  }

  return {
    vote:   "YES",
    reason: `Good value — no red flags, clean sheet risk low, combo ${combo.toFixed(1)}% justifies the bet`
  }
}

// ══════════════════════════════════════════
//  runEnsemble — main export
//  Takes a candidate prediction object,
//  runs all 3 analysts, returns result with
//  consensus flag and individual votes.
// ══════════════════════════════════════════

function runEnsemble(prediction) {
  const stats = statsAnalyst(prediction)
  const form  = formAnalyst(prediction)
  const value = valueAnalyst(prediction)

  const consensus =
    stats.vote === "YES" &&
    form.vote  === "YES" &&
    value.vote === "YES"

  return {
    ...prediction,
    ai: {
      consensus,
      votes: {
        statistics: stats,
        form:       form,
        value:      value
      }
    }
  }
}

module.exports = { runEnsemble, statsAnalyst, formAnalyst, valueAnalyst }
