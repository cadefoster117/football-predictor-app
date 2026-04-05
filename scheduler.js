// ══════════════════════════════════════════
//  AivsBookie — scheduler.js
//  Runs all engines ONCE per day at 00:05
//  Set SCAN_TIMEZONE in .env (IANA format)
//  e.g. Europe/London, America/New_York
//  Default: UTC
// ══════════════════════════════════════════

require("dotenv").config()
const { exec } = require("child_process")

const TIMEZONE = process.env.SCAN_TIMEZONE || "UTC"

// Calculate ms until next 00:05 in the configured timezone
function msUntilNextScan() {
  const now = new Date()

  // Get current time in target timezone
  const tzNow = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }))

  // Build next 00:05 target in that timezone
  const target = new Date(tzNow)
  target.setHours(0, 5, 0, 0)

  // If 00:05 already passed today, schedule for tomorrow
  if (tzNow >= target) target.setDate(target.getDate() + 1)

  // Convert back: find the UTC offset difference
  const offsetMs = now - tzNow
  const targetUTC = new Date(target.getTime() + offsetMs)

  return targetUTC - now
}

function runAll() {
  const ts = new Date().toLocaleString("en-GB", { timeZone: TIMEZONE })
  console.log(`\n[Scheduler] Daily scan at ${ts} (${TIMEZONE})`)

  exec("node engine.js", (err, stdout) => {
    if (err) console.error("[Scheduler] Main engine error:", err.message)
    else     console.log("[Scheduler] Main engine done")
  })

  exec("node accas-engine.js", (err, stdout) => {
    if (err) console.error("[Scheduler] Accas engine error:", err.message)
    else     console.log("[Scheduler] Accas engine done")
  })

  exec("node freewill-engine.js", (err, stdout) => {
    if (err) { console.error("[Scheduler] FreeWill engine error:", err.message); return }
    console.log("[Scheduler] FreeWill engine done")

    if (process.env.LLMAPI_KEY) {
      exec("node freewill-debate.js", (err2) => {
        if (err2) console.error("[Scheduler] Debate error:", err2.message)
        else      console.log("[Scheduler] Debate done")
      })
    }
  })
}

function scheduleNextRun() {
  const ms = msUntilNextScan()
  const hrs  = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)

  console.log(`[Scheduler] Next scan in ${hrs}h ${mins}m (daily at 00:05 ${TIMEZONE})`)

  setTimeout(() => {
    runAll()
    // Schedule the one after
    scheduleNextRun()
  }, ms)
}

scheduleNextRun()
