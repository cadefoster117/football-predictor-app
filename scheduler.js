// ══════════════════════════════════════════
//  AivsBookie — scheduler.js
//  Runs ALL engines once per day at 00:05
//  Timezone: Europe/Sofia (Bulgaria)
// ══════════════════════════════════════════

require("dotenv").config()
const { exec } = require("child_process")

const TIMEZONE = process.env.SCAN_TIMEZONE || "Europe/Sofia"

function msUntilNextScan() {
  const now   = new Date()
  const tzNow = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }))

  const target = new Date(tzNow)
  target.setHours(0, 5, 0, 0)

  // Already past 00:05 today → schedule tomorrow
  if (tzNow >= target) target.setDate(target.getDate() + 1)

  const offsetMs  = now - tzNow
  const targetUTC = new Date(target.getTime() + offsetMs)
  return targetUTC - now
}

function runAll() {
  const ts = new Date().toLocaleString("en-GB", { timeZone: TIMEZONE })
  console.log(`\n[Scheduler] Daily scan started at ${ts} (${TIMEZONE})`)

  // Step 1: main predictions engine
  exec("node engine.js", (err) => {
    if (err) console.error("[Scheduler] Main engine error:", err.message)
    else     console.log("[Scheduler] ✓ Main engine done")
  })

  // Step 2: accas engine (DeepSeek)
  exec("node accas-engine.js", (err) => {
    if (err) console.error("[Scheduler] Accas engine error:", err.message)
    else     console.log("[Scheduler] ✓ Accas engine done")
  })

  // Step 3: freewill models → then debate
  exec("node freewill-engine.js", (err) => {
    if (err) { console.error("[Scheduler] FreeWill engine error:", err.message); return }
    console.log("[Scheduler] ✓ FreeWill engine done")

    if (process.env.LLMAPI_KEY) {
      exec("node freewill-debate.js", (err2) => {
        if (err2) console.error("[Scheduler] Debate error:", err2.message)
        else      console.log("[Scheduler] ✓ Debate done")
      })
    }
  })
}

function scheduleNextRun() {
  const ms   = msUntilNextScan()
  const hrs  = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  console.log(`[Scheduler] Next scan in ${hrs}h ${mins}m — daily at 00:05 Europe/Sofia`)

  setTimeout(() => {
    runAll()
    scheduleNextRun()
  }, ms)
}

scheduleNextRun()
