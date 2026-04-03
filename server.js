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

// ── Startup ───────────────────────────────

function runOnStartup() {

  // Always run main engine
  console.log("▶ Running main engine...")
  exec("node engine.js", (err, stdout) => {
    if (err) console.error("✗ Main engine:", err.message)
    else     console.log(stdout)
  })

  // Always run freewill models (no API key needed)
 // console.log("▶ Running FreeWill models...")
//  exec("node freewill-engine.js", (err, stdout) => {
   // if (err) {
   //   console.error("✗ FreeWill engine:", err.message)
   //   return
 //   }
   // console.log(stdout)

    // Only run debate if API key is present
//    if (process.env.ANTHROPIC_API_KEY) {
   //   console.log("▶ Running FreeWill debate...")
    //  exec("node freewill-debate.js", (err2, stdout2) => {
    //    if (err2) console.error("✗ Debate engine:", err2.message)
    //    else      console.log(stdout2)
   //   })
 //   } else {
  //    console.log("⚠ ANTHROPIC_API_KEY not set — debate skipped on startup")
  //  }
 // })
}
// === TEAM FREE WILL - 3 AI Debate ===
const { callLLM } = require('./llm-helper');

app.get('/team-free-will', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'freewill.html'));
});

app.get('/api/debate', async (req, res) => {
  try {
    let predictions = [];

    // Safe load predictions.json
    const fs = require('fs');
    const filePath = './public/freewill-predictions.json';

    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (raw) {
        predictions = JSON.parse(raw);
        if (!Array.isArray(predictions)) predictions = [];
      }
    }

    if (predictions.length === 0) {
      return res.json({
        success: false,
        message: "freewill-predictions.json is empty or missing. Please run the engine first (npm run update)"
      });
    }

    const now = Date.now();
    const twentyFourHoursLater = now + 24 * 60 * 60 * 1000;

    const candidates = predictions
      .filter(p => {
        if (!p?.date) return false;
        try {
          const matchTime = new Date(p.date).getTime();
          return matchTime > now && matchTime < twentyFourHoursLater;
        } catch (e) {
          return false;
        }
      })
      .slice(0, 8);

    if (candidates.length === 0) {
      return res.json({
        success: false,
        message: `Found ${predictions.length} total predictions, but none in the next 24 hours.<br><br>Try running the engine again (npm run update)`,
        totalPredictions: predictions.length
      });
    }

    console.log(`🎯 Starting Team Free Will debate for ${candidates.length} matches`);

    // ... (rest of the debate logic stays the same as my previous version)
// === TEAM FREE WILL - 3 AI Debate (Gemini + DeepSeek + GPT) ===
const { callLLM } = require('./llm-helper');

app.get('/team-free-will', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'freewill.html'));
});

app.get('/api/debate', async (req, res) => {
  try {
    let predictions = [];
    const fs = require('fs');

    // 1. Try your current Free Will file first
    const freeWillFile = './public/free-will-predictions.json';
    const originalFile = './public/predictions.json';

    if (fs.existsSync(freeWillFile)) {
      const raw = fs.readFileSync(freeWillFile, 'utf8').trim();
      if (raw) {
        predictions = JSON.parse(raw);
        console.log(`📂 Loaded ${predictions.length} matches from free-will-predictions.json`);
      }
    } 
    // 2. Fallback to original engine file
    else if (fs.existsSync(originalFile)) {
      const raw = fs.readFileSync(originalFile, 'utf8').trim();
      if (raw) {
        predictions = JSON.parse(raw);
        console.log(`📂 Loaded ${predictions.length} matches from predictions.json (fallback)`);
      }
    }

    // Ensure we always have an array
    if (!Array.isArray(predictions)) predictions = [];

    if (predictions.length === 0) {
      return res.json({
        success: false,
        message: "free-will-predictions.json is empty or missing.<br><br>Please run:<br><b>npm run update</b><br>or<br><b>node engine.js</b>"
      });
    }

    // Filter next 24 hours
    const now = Date.now();
    const twentyFourHoursLater = now + 24 * 60 * 60 * 1000;

    const candidates = predictions
      .filter(p => {
        if (!p?.date) return false;
        try {
          const matchTime = new Date(p.date).getTime();
          return matchTime > now && matchTime < twentyFourHoursLater;
        } catch (e) {
          return false;
        }
      })
      .slice(0, 8);

    if (candidates.length === 0) {
      return res.json({
        success: false,
        message: `Found ${predictions.length} total matches, but none are in the next 24 hours.<br><br>Run <b>npm run update</b> again to get fresh games.`
      });
    }

    console.log(`🚀 Starting Team Free Will debate for ${candidates.length} matches`);

    const debates = [];

    const systemPrompt = `You are a professional football betting analyst specialized in Over 2.5 goals + Both Teams To Score (BTTS) combo bets.
Analyze ONLY the provided data. Do not invent statistics.
Respond strictly with valid JSON:
{
  "vote": "YES"|"NO"|"MAYBE",
  "confidence": number 0-100,
  "reason": "clear explanation, max 3 sentences"
}`;

    for (const match of candidates) {
      const context = `
Match: ${match.home || '?'} vs ${match.away || '?'}
League: ${match.league || 'Unknown'}
Prob Over 2.5: ${match.prob_over25 || 0}%
Prob BTTS: ${match.prob_btts || 0}%
Combo Prob: ${match.prob_combo || 0}%
xG Home: ${match.xg_home || 'N/A'} | xG Away: ${match.xg_away || 'N/A'}
      `.trim();

      const userPrompt = `Analyze this match for Over 2.5 + BTTS combo:\n${context}`;

      const [geminiRes, deepseekRes, gptRes] = await Promise.all([
        callLLM('gemini', systemPrompt, userPrompt).catch(() => ({vote:"ERROR", confidence:0, reason:"Failed"})),
        callLLM('deepseek', systemPrompt, userPrompt).catch(() => ({vote:"ERROR", confidence:0, reason:"Failed"})),
        callLLM('gpt', systemPrompt, userPrompt).catch(() => ({vote:"ERROR", confidence:0, reason:"Failed"}))
      ]);

      const allVotes = [geminiRes, deepseekRes, gptRes];
      const yesCount = allVotes.filter(v => v.vote === "YES").length;
      const avgConfidence = Math.round(allVotes.reduce((s, v) => s + (v.confidence || 0), 0) / 3);

      debates.push({
        match: `${match.home || '?'} vs ${match.away || '?'}`,
        date: match.date,
        gemini: geminiRes,
        deepseek: deepseekRes,
        gpt: gptRes,
        consensus: {
          yesCount,
          avgConfidence,
          strength: yesCount >= 2 ? "STRONG" : yesCount === 1 ? "MODERATE" : "WEAK"
        }
      });
    }

    fs.writeFileSync('./public/debates.json', JSON.stringify(debates, null, 2));

    res.json({ success: true, debates, count: debates.length });

  } catch (error) {
    console.error('Team Free Will error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.listen(PORT, () => {
  console.log(`\n✓ Server running on port ${PORT}`)
  runOnStartup()
})
