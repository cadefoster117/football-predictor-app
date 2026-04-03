// ══════════════════════════════════════════
//  AivsBookie — server.js
// ══════════════════════════════════════════

require("dotenv").config()

const express  = require("express")
const fs       = require("fs")
const path     = require("path")
const { exec } = require("child_process")

require("./scheduler")

const app  = express()
const PORT = process.env.PORT || 3000

// ── Static frontend ───────────────────────

app.use(express.static(path.join(__dirname, "public")))

// ── Pages ─────────────────────────────────

app.get("/",         (req, res) => res.sendFile(path.join(__dirname, "public/index.html")))
app.get("/history",  (req, res) => res.sendFile(path.join(__dirname, "public/history.html")))
app.get("/freewill", (req, res) => res.sendFile(path.join(__dirname, "public/freewill.html")))

// ── API: main predictions ─────────────────

app.get("/predictions", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "public/predictions.json"))
    res.json(JSON.parse(data))
  } catch {
    res.json({ last_scan: null, games_scanned: 0, candidates: 0, ai_confirmed: 0, predictions: [] })
  }
})

// ── API: freewill model scores ────────────

app.get("/freewill-predictions", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "public/freewill-predictions.json"))
    res.json(JSON.parse(data))
  } catch {
    res.json({ last_scan: null, games_scanned: 0, games_in_24h: 0, confirmed: 0, top10: [] })
  }
})

// ── API: freewill debate results ──────────

app.get("/freewill-debate", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "public/freewill-debate.json"))
    res.json(JSON.parse(data))
  } catch {
    res.json({ last_scan: null, games_debated: 0, passed: 0, results: [] })
  }
})

// ── Manual trigger: main engine ───────────

app.get("/run-engine", (req, res) => {
  exec("node engine.js", (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr })
    res.json({ ok: true, output: stdout })
  })
})

// ── Manual trigger: freewill models only ─

app.get("/run-freewill", (req, res) => {
  exec("node freewill-engine.js", (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr })
    res.json({ ok: true, output: stdout })
  })
})

// ── Manual trigger: freewill models + debate

app.get("/run-freewill-debate", (req, res) => {

  // Step 1: always run models (no API key needed)
  exec("node freewill-engine.js", (err1, stdout1) => {

    if (err1) {
      return res.status(500).json({
        error: "freewill-engine failed: " + err1.message,
        output: stdout1
      })
    }

    // Step 2: only run debate if Anthropic key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({
        ok:     true,
        output: stdout1,
        note:   "ANTHROPIC_API_KEY not set — model scores updated, debate skipped"
      })
    }

    exec("node freewill-debate.js", (err2, stdout2) => {
      if (err2) {
        return res.status(500).json({
          error:  "freewill-debate failed: " + err2.message,
          output: stdout1 + "\n" + stdout2
        })
      }
      res.json({ ok: true, output: stdout1 + "\n" + stdout2 })
    })
  })
})
// === TEAM FREE WILL ROUTES (add this block) ===
const { callLLM } = require('./llm-helper');

// GET the Team Free Will page
app.get('/team-free-will', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'freewill.html'));
});

// API endpoint to run debate
app.get('/api/debate', async (req, res) => {
  try {
    // Load latest predictions (your existing ones)
    let predictions = [];
    try {
      predictions = require('./public/predictions.json');
    } catch (e) {
      predictions = [];
    }

    // Take only next 24h + top candidates (limit to 8 to control cost)
    const candidates = predictions
      .filter(p => new Date(p.date) > Date.now() && new Date(p.date) < Date.now() + 24*60*60*1000)
      .slice(0, 8);

    if (candidates.length === 0) {
      return res.json({ success: false, message: "No matches in next 24 hours" });
    }

    const debates = [];

    for (const match of candidates) {
      const context = `
Match: ${match.home} vs ${match.away}
League: ${match.league || 'Unknown'}
Date: ${match.date}
Prob Over 2.5: ${match.prob_over25}%
Prob BTTS: ${match.prob_btts}%
Combo Prob: ${match.prob_combo}%
xG Home: ${match.xg_home || 'N/A'}, xG Away: ${match.xg_away || 'N/A'}
Your analysts votes: ${JSON.stringify(match.analysts || {})}
      `.trim();

      const systemPrompt = `You are a professional soccer betting expert specialized in Over 2.5 goals + Both Teams To Score (BTTS) bets.
Analyze ONLY the provided data. Do not invent statistics.
Output strictly valid JSON with this structure:
{
  "vote": "YES" or "NO" or "MAYBE",
  "confidence": number between 0 and 100,
  "reason": "short clear explanation (2-4 sentences max)"
}`;

      const userPrompt = `Analyze this match for Over 2.5 + BTTS combo:\n${context}`;

      // Call all 4 models in parallel
      const [geminiRes, claudeRes, deepseekRes, gptRes] = await Promise.all([
        callLLM('gemini', systemPrompt, userPrompt),
        callLLM('claude', systemPrompt, userPrompt),
        callLLM('deepseek', systemPrompt, userPrompt),
        callLLM('gpt', systemPrompt, userPrompt)
      ]);

      const allVotes = [geminiRes, claudeRes, deepseekRes, gptRes];
      const yesCount = allVotes.filter(v => v.vote === "YES").length;
      const avgConfidence = allVotes.reduce((sum, v) => sum + (v.confidence || 0), 0) / 4;

      debates.push({
        match: `${match.home} vs ${match.away}`,
        date: match.date,
        data: match,
        gemini: geminiRes,
        claude: claudeRes,
        deepseek: deepseekRes,
        gpt: gptRes,
        consensus: {
          yesCount: yesCount,
          avgConfidence: Math.round(avgConfidence),
          strength: yesCount >= 3 ? "STRONG" : yesCount >= 2 ? "MODERATE" : "WEAK"
        }
      });
    }

    // Save to public for the frontend
    const fs = require('fs');
    fs.writeFileSync('./public/debates.json', JSON.stringify(debates, null, 2));

    res.json({ success: true, debates, count: debates.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// ── Startup ───────────────────────────────

function runOnStartup() {

  // Always run main engine
  console.log("▶ Running main engine...")
  exec("node engine.js", (err, stdout) => {
    if (err) console.error("✗ Main engine:", err.message)
    else     console.log(stdout)
  })

  // Always run freewill models (no API key needed)
  console.log("▶ Running FreeWill models...")
  exec("node freewill-engine.js", (err, stdout) => {
    if (err) {
      console.error("✗ FreeWill engine:", err.message)
      return
    }
    console.log(stdout)

    // Only run debate if API key is present
    if (process.env.ANTHROPIC_API_KEY) {
      console.log("▶ Running FreeWill debate...")
      exec("node freewill-debate.js", (err2, stdout2) => {
        if (err2) console.error("✗ Debate engine:", err2.message)
        else      console.log(stdout2)
      })
    } else {
      console.log("⚠ ANTHROPIC_API_KEY not set — debate skipped on startup")
    }
  })
}

app.listen(PORT, () => {
  console.log(`\n✓ Server running on port ${PORT}`)
  runOnStartup()
})
