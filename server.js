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

// ── Serve frontend ────────────────────────

app.use(express.static(path.join(__dirname, "public")))

// ── Pages ─────────────────────────────────

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"))
})

app.get("/history", (req, res) => {
  res.sendFile(path.join(__dirname, "public/history.html"))
})

// ── Predictions API ───────────────────────

app.get("/predictions", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "public/predictions.json"))
    res.json(JSON.parse(data))
  } catch {
    res.json({
      last_scan:    null,
      games_scanned: 0,
      candidates:    0,
      ai_confirmed:  0,
      predictions:   []
    })
  }
})

// ── Manual trigger ────────────────────────

app.get("/run-engine", (req, res) => {
  console.log("Manual engine trigger...")
  exec("node engine.js", (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr })
    res.json({ ok: true, output: stdout })
  })
})

// ── Start ─────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log("Running first scan...")
  exec("node engine.js", (err, stdout) => {
    if (err) console.error("Scan error:", err.message)
    else     console.log(stdout)
  })
})
