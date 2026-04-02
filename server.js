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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"))
})

app.get("/history", (req, res) => {
  res.sendFile(path.join(__dirname, "public/history.html"))
})

app.get("/freewill", (req, res) => {
  res.sendFile(path.join(__dirname, "public/freewill.html"))
})

// ── API: main predictions ─────────────────

app.get("/predictions", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "public/predictions.json"))
    res.json(JSON.parse(data))
  } catch {
    res.json({ last_scan: null, games_scanned: 0, candidates: 0, ai_confirmed: 0, predictions: [] })
  }
})

// ── API: freewill predictions ─────────────

app.get("/freewill-predictions", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "public/freewill-predictions.json"))
    res.json(JSON.parse(data))
  } catch {
    res.json({ last_scan: null, games_scanned: 0, games_in_24h: 0, confirmed: 0, top10: [] })
  }
})

// ── Manual triggers (for testing) ─────────

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

// ── Start ─────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)

  // Run both engines on startup
  console.log("Running main engine...")
  exec("node engine.js", (err, stdout) => {
    if (err) console.error("Main engine error:", err.message)
    else console.log(stdout)
  })

  console.log("Running FreeWill engine...")
  exec("node freewill-engine.js", (err, stdout) => {
    if (err) console.error("FreeWill engine error:", err.message)
    else console.log(stdout)
  })
})
