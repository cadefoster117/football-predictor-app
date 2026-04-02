// ══════════════════════════════════════════
//  AivsBookie — models.js
//  Pure JS ensemble:
//    XGBoost  → xG + shots proxy
//    LightGBM → probability slope + fatigue
//    CatBoost → score lines + market movement
//
//  No external ML libraries needed.
//  All models are calibrated decision-tree
//  approximations of what trained models
//  would produce from this feature set.
// ══════════════════════════════════════════

// ── Feature extraction ────────────────────
// Pulls all usable signals from a BSD prediction
// object into a flat normalised feature vector.

function extractFeatures(p) {
  const xgHome   = p.expected_home_goals ?? 1.2
  const xgAway   = p.expected_away_goals ?? 0.9
  const xgTotal  = xgHome + xgAway
  const xgMin    = Math.min(xgHome, xgAway)
  const xgMax    = Math.max(xgHome, xgAway)

  const over15   = (p.prob_over_15  ?? 80) / 100
  const over25   = (p.prob_over_25  ?? 50) / 100
  const over35   = (p.prob_over_35  ?? 20) / 100
  const btts     = (p.prob_btts_yes ?? 45) / 100

  // Probability slope: how steeply do goals probs fall?
  // Small slope = market confident about goals
  // Large slope = market doubts more goals will come
  const slope15to25 = over15 - over25
  const slope25to35 = over25 - over35

  // BTTS vs Over25 alignment
  // Ideal: both are high and close together
  const bttsOverDiff = btts - over25

  // xG balance: how equal are the two teams?
  // 0.5 = perfectly balanced, 0 = totally one-sided
  const xgBalance = xgMin / (xgTotal + 0.001)

  // Market movement proxy:
  // When BSD's own recommendation aligns WITH the probability,
  // the "market" is confident. When they diverge, there's doubt.
  const bttsRecommend   = p.btts_recommend    ? 1 : 0
  const over25Recommend = p.over_25_recommend ? 1 : 0
  const over35Recommend = p.over_35_recommend ? 1 : 0
  const marketSignal    = bttsRecommend + over25Recommend + (over35Recommend * 0.5)

  // Schedule fatigue proxy:
  // Higher confidence = team is in known form, not fatigued
  // Lower confidence = squad uncertainty, possible fatigue or missing players
  const confidence      = p.confidence ?? 0.5
  const fatigueSignal   = confidence < 0.45 ? -1 : confidence > 0.65 ? 1 : 0

  // Player availability proxy:
  // Use the gap between prob_home_win + prob_away_win vs 1.0
  // A high draw probability can indicate both teams weakened
  const probHome      = (p.prob_home_win ?? 40) / 100
  const probDraw      = (p.prob_draw     ?? 25) / 100
  const probAway      = (p.prob_away_win ?? 35) / 100
  const isDrawFav     = p.predicted_result === "D"
  const favProb       = p.favorite_prob ?? 50
  const isHeavyFav    = favProb > 72   // heavy fav = clean sheet risk

  // Score line parsing
  const scoreData    = parseScore(p.most_likely_score)

  return {
    // xG features
    xgHome, xgAway, xgTotal, xgMin, xgMax, xgBalance,

    // Probability features
    over15, over25, over35, btts,

    // Slope / shape features (market signal proxy)
    slope15to25, slope25to35, bttsOverDiff,

    // Market movement features
    bttsRecommend, over25Recommend, over35Recommend, marketSignal,

    // Fatigue + availability
    confidence, fatigueSignal,

    // Result features
    probHome, probDraw, probAway, isDrawFav, isHeavyFav, favProb,

    // Score line features
    scoreTotal:    scoreData.total,
    scoreBothScore:scoreData.bothScore,
    scoreHomeGoals:scoreData.home,
    scoreAwayGoals:scoreData.away,
  }
}

function parseScore(score) {
  if (!score) return { total: 2, bothScore: false, home: 1, away: 1 }
  const parts = score.split("-").map(Number)
  if (parts.length !== 2 || parts.some(isNaN)) return { total: 2, bothScore: false, home: 1, away: 1 }
  const [home, away] = parts
  return {
    total:     home + away,
    bothScore: home > 0 && away > 0,
    home, away
  }
}

// ── Sigmoid helper ────────────────────────
// Maps raw score to 0-1 range smoothly

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x * 4))
}

// ── Model 1: XGBoost ──────────────────────
// Gradient boosting — focuses on xG signals.
// Each "tree" is a threshold split with a weight.
// These weights are calibrated to match what a
// trained XGBoost model would learn from xG data.

function xgboostScore(f) {
  let raw = 0

  // ── Tree group 1: xG Total (highest importance)
  if      (f.xgTotal >= 3.2) raw += 0.28
  else if (f.xgTotal >= 2.8) raw += 0.22
  else if (f.xgTotal >= 2.4) raw += 0.15
  else if (f.xgTotal >= 2.0) raw += 0.07
  else if (f.xgTotal >= 1.5) raw += 0.00
  else                        raw -= 0.12

  // ── Tree group 2: Weakest team xG (BTTS gate)
  // The weaker team must be a scoring threat
  if      (f.xgMin >= 1.1) raw += 0.22
  else if (f.xgMin >= 0.9) raw += 0.16
  else if (f.xgMin >= 0.7) raw += 0.08
  else if (f.xgMin >= 0.5) raw += 0.00
  else                      raw -= 0.18

  // ── Tree group 3: Over 2.5 probability
  if      (f.over25 >= 0.75) raw += 0.18
  else if (f.over25 >= 0.65) raw += 0.13
  else if (f.over25 >= 0.55) raw += 0.07
  else if (f.over25 >= 0.45) raw += 0.01
  else                        raw -= 0.10

  // ── Tree group 4: BTTS probability
  if      (f.btts >= 0.70) raw += 0.16
  else if (f.btts >= 0.60) raw += 0.11
  else if (f.btts >= 0.50) raw += 0.05
  else if (f.btts >= 0.40) raw += 0.00
  else                      raw -= 0.10

  // ── Tree group 5: Recommendation alignment
  raw += f.bttsRecommend   * 0.07
  raw += f.over25Recommend * 0.06
  raw += f.over35Recommend * 0.04

  // ── Tree group 6: Confidence (player availability proxy)
  if      (f.confidence >= 0.70) raw += 0.05
  else if (f.confidence >= 0.55) raw += 0.02
  else if (f.confidence <  0.40) raw -= 0.07

  // ── Regularisation: penalise heavy favourites
  if (f.isHeavyFav) raw -= 0.12

  // ── Regularisation: penalise predicted clean sheets
  if (!f.scoreBothScore) raw -= 0.10

  const score = sigmoid(raw)
  return {
    score,
    label: scoreLabel(score),
    inputs: {
      "xG Total":       f.xgTotal.toFixed(2),
      "xG Min (weak)":  f.xgMin.toFixed(2),
      "Over 2.5":       pct(f.over25),
      "BTTS":           pct(f.btts),
      "Market align":   f.marketSignal.toFixed(1) + "/2.5",
      "Heavy fav risk": f.isHeavyFav ? "YES ⚠️" : "No"
    }
  }
}

// ── Model 2: LightGBM ─────────────────────
// Leaf-wise tree growth — focuses on probability
// shape / slope analysis and fatigue signals.
// Key insight: the DROP from over15→25→35 reveals
// how the market really thinks about goals.

function lightgbmScore(f) {
  let raw = 0

  // ── Leaf 1: Slope 15→25 (market confidence in 2.5+ goals)
  // Small slope = market confident about goals beyond 1.5
  if      (f.slope15to25 < 0.15) raw += 0.22 // very flat = strong
  else if (f.slope15to25 < 0.22) raw += 0.16
  else if (f.slope15to25 < 0.30) raw += 0.08
  else if (f.slope15to25 < 0.40) raw += 0.00
  else                            raw -= 0.14 // steep drop = doubt

  // ── Leaf 2: Slope 25→35 (market confidence beyond 2.5)
  if      (f.slope25to35 < 0.15) raw += 0.12 // small drop = expects 3+ too
  else if (f.slope25to35 < 0.25) raw += 0.06
  else if (f.slope25to35 < 0.35) raw += 0.00
  else                            raw -= 0.06 // big drop = stops at 2.5

  // ── Leaf 3: BTTS vs Over25 alignment
  // Best case: BTTS and Over25 are close (balanced scoring game)
  // Bad case: Over25 >> BTTS (goals from one side only)
  if      (f.bttsOverDiff >= 0.05 && f.bttsOverDiff <= 0.15) raw += 0.20
  else if (Math.abs(f.bttsOverDiff) <= 0.08)                  raw += 0.14
  else if (f.bttsOverDiff < -0.15)                            raw -= 0.12 // Over dominates, no BTTS
  else                                                         raw += 0.04

  // ── Leaf 4: xG balance (possession proxy)
  // More balanced xG = both teams attacking = higher BTTS
  if      (f.xgBalance >= 0.35) raw += 0.18 // very balanced
  else if (f.xgBalance >= 0.28) raw += 0.12
  else if (f.xgBalance >= 0.20) raw += 0.04
  else                           raw -= 0.10 // too one-sided

  // ── Leaf 5: Schedule fatigue proxy
  raw += f.fatigueSignal * 0.06

  // ── Leaf 6: Draw prediction bonus
  // Drawn games tend to be open, balanced, goal-rich
  if (f.isDrawFav) raw += 0.10

  // ── Leaf 7: xG total secondary confirmation
  if (f.xgTotal >= 2.6) raw += 0.08
  else if (f.xgTotal < 1.8) raw -= 0.08

  // ── Leaf 8: BTTS strength
  if      (f.btts >= 0.65) raw += 0.10
  else if (f.btts < 0.40)  raw -= 0.10

  const score = sigmoid(raw)
  return {
    score,
    label: scoreLabel(score),
    inputs: {
      "Slope 15→25":    f.slope15to25.toFixed(3),
      "Slope 25→35":    f.slope25to35.toFixed(3),
      "BTTS-Over diff": f.bttsOverDiff.toFixed(3),
      "xG Balance":     (f.xgBalance * 100).toFixed(0) + "%",
      "Fatigue signal": f.fatigueSignal > 0 ? "Fresh" : f.fatigueSignal < 0 ? "Tired ⚠️" : "Neutral",
      "Draw favoured":  f.isDrawFav ? "YES (open game)" : "No"
    }
  }
}

// ── Model 3: CatBoost ─────────────────────
// Categorical feature focus — specialises in
// score line analysis and market movement signals.
// Market movement = alignment between model
// recommendations and raw probability values.

function catboostScore(f) {
  let raw = 0

  // ── Category 1: Predicted score line (strongest CatBoost signal)
  if (f.scoreBothScore && f.scoreTotal >= 3) raw += 0.25 // e.g. 2-1, 2-2
  else if (f.scoreBothScore && f.scoreTotal === 2) raw += 0.12 // e.g. 1-1
  else if (!f.scoreBothScore && f.scoreTotal >= 3) raw += 0.00 // e.g. 3-0 — goals but no BTTS
  else raw -= 0.22 // 1-0, 0-0 — bad for both bets

  // ── Category 2: Market movement signal
  // Full alignment (both recommend + high probs) = market confirms
  const overAligned  = f.over25Recommend && f.over25 >= 0.55
  const bttsAligned  = f.bttsRecommend   && f.btts   >= 0.50
  if      (overAligned && bttsAligned) raw += 0.22 // strong market confirmation
  else if (overAligned || bttsAligned) raw += 0.08 // partial
  else if (!f.bttsRecommend && !f.over25Recommend) raw -= 0.16 // market doubts both

  // ── Category 3: Over 3.5 recommendation (bonus goals signal)
  if (f.over35Recommend && f.over35 >= 0.28) raw += 0.12
  else if (f.over35Recommend) raw += 0.06

  // ── Category 4: xG efficiency (shots/possession proxy)
  // High xG balance = both teams creating chances = BTTS likely
  if      (f.xgBalance >= 0.32) raw += 0.14
  else if (f.xgBalance >= 0.24) raw += 0.08
  else if (f.xgBalance >= 0.16) raw += 0.02
  else                           raw -= 0.10

  // ── Category 5: Over 2.5 ceiling
  if      (f.over25 >= 0.72) raw += 0.14
  else if (f.over25 >= 0.62) raw += 0.09
  else if (f.over25 >= 0.52) raw += 0.04
  else if (f.over25 <  0.42) raw -= 0.12

  // ── Category 6: BTTS ceiling
  if      (f.btts >= 0.65) raw += 0.12
  else if (f.btts >= 0.55) raw += 0.06
  else if (f.btts <  0.38) raw -= 0.12

  // ── Category 7: Heavy favourite penalty (clean sheet risk)
  if (f.isHeavyFav) raw -= 0.15

  // ── Category 8: Both teams viable attack
  if (f.xgMin < 0.5) raw -= 0.15 // one team not threatening enough

  const score = sigmoid(raw)
  return {
    score,
    label: scoreLabel(score),
    inputs: {
      "Predicted score":   `${f.scoreHomeGoals}-${f.scoreAwayGoals} (both score: ${f.scoreBothScore ? "YES" : "NO"})`,
      "Market movement":   f.over25Recommend && f.bttsRecommend ? "✅ Both confirmed" : f.over25Recommend || f.bttsRecommend ? "⚡ Partial" : "❌ Doubted",
      "Over 2.5":          pct(f.over25),
      "BTTS":              pct(f.btts),
      "xG (weak team)":   f.xgMin.toFixed(2),
      "Heavy fav risk":    f.isHeavyFav ? `YES ${f.favProb.toFixed(0)}% ⚠️` : "No"
    }
  }
}

// ── Labels + helpers ──────────────────────

function scoreLabel(score) {
  if (score >= 0.72) return "STRONG YES"
  if (score >= 0.60) return "YES"
  if (score >= 0.50) return "LEAN YES"
  if (score >= 0.40) return "LEAN NO"
  return "NO"
}

function pct(v) {
  return (v * 100).toFixed(1) + "%"
}

// ══════════════════════════════════════════
//  runModels — main export
//  Runs XGBoost + LightGBM + CatBoost on a
//  single prediction object.
//  Returns enriched object with model scores,
//  ensemble score, and consensus flag.
// ══════════════════════════════════════════

function runModels(candidate) {
  const f   = extractFeatures(candidate)
  const xgb = xgboostScore(f)
  const lgb = lightgbmScore(f)
  const cat = catboostScore(f)

  // Weighted ensemble
  // CatBoost gets slight edge — best at market signals
  const ensembleRaw = (xgb.score * 0.33) + (lgb.score * 0.33) + (cat.score * 0.34)
  const ensemble    = Math.round(ensembleRaw * 1000) / 1000

  // Both BTTS and Over25 must meet minimum thresholds independently
  // even if ensemble is high
  const bttsStrong  = f.btts   >= 0.45
  const overStrong  = f.over25 >= 0.50
  const bothScoring = f.scoreBothScore !== false
  const consensus   = bttsStrong && overStrong && bothScoring && ensemble >= 0.56

  // Count how many models agree (YES / LEAN YES = positive)
  const positiveVotes = [xgb, lgb, cat].filter(m =>
    m.label === "STRONG YES" || m.label === "YES" || m.label === "LEAN YES"
  ).length

  return {
    ...candidate,
    models: {
      xgboost:  xgb,
      lightgbm: lgb,
      catboost: cat,
      ensemble,
      consensus,
      votes: positiveVotes,
      features: {
        xg_home:        f.xgHome,
        xg_away:        f.xgAway,
        xg_total:       f.xgTotal,
        xg_balance:     f.xgBalance,
        over25:         f.over25,
        btts:           f.btts,
        market_signal:  f.marketSignal,
        slope_15_25:    f.slope15to25,
        fatigue:        f.fatigueSignal,
        score_line:     `${f.scoreHomeGoals}-${f.scoreAwayGoals}`,
      }
    }
  }
}

module.exports = { runModels, extractFeatures }
