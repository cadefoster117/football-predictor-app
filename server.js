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

app.get("/",          (req, res) => res.sendFile(path.join(__dirname, "public/index.html")))
app.get("/history",   (req, res) => res.sendFile(path.join(__dirname, "public/history.html")))
app.get("/freewill",  (req, res) => res.sendFile(path.join(__dirname, "public/freewill.html")))

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

// ── Manual triggers ───────────────────────

app.get("/run-engine", (req, res) => {
  exec("node engine.js", (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr })
    res.json({ ok: true, output: stdout })
  })
})

app.get("/run-freewill", (req, res) => {
  exec("node freewill-engine.js", (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr })
    res.json({ ok: true, output: stdout })
  })
})

app.get("/run-freewill-debate", (req, res) => {
  // Runs both: models first, then debate
  exec("node freewill-engine.js && node freewill-debate.js", (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr })
    res.json({ ok: true, output: stdout })
  })
})

// ── Start ─────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)

  // Run main engine on startup
  console.log("Running main engine...")
  exec("node engine.js", (err, stdout) => {
    if (err) console.error("Main engine error:", err.message)
    else console.log(stdout)
  })

  // Run freewill models on startup
  console.log("Running FreeWill engine...")
  exec("node freewill-engine.js", (err, stdout) => {
    if (err) console.error("FreeWill engine error:", err.message)
    else console.log(stdout)

    // Run debate after freewill models finish (needs freewill-predictions.json first)
    if (process.env.ANTHROPIC_API_KEY) {
      console.log("Running FreeWill debate...")
      exec("node freewill-debate.js", (err2, stdout2) => {
        if (err2) console.error("Debate error:", err2.message)
        else console.log(stdout2)
      })
    } else {
      console.log("⚠️  ANTHROPIC_API_KEY not set — skipping debate engine")
    }
  })
})
