// ══════════════════════════════════════════
//  AivsBookie — scheduler.js
//  Runs both engines every 6 hours
// ══════════════════════════════════════════

const { exec } = require("child_process")

const INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

function scanAll() {
  const ts = new Date().toISOString()
  console.log(`\n[Scheduler] ${ts} — running scheduled scan`)

  exec("node engine.js", (err, stdout) => {
    if (err) console.error("[Scheduler] Main engine error:", err.message)
    else     console.log("[Scheduler] Main engine done\n" + stdout)
  })

  exec("node freewill-engine.js", (err, stdout) => {
    if (err) { console.error("[Scheduler] FreeWill engine error:", err.message); return }
    console.log("[Scheduler] FreeWill engine done\n" + stdout)

    if (process.env.LLMAPI_KEY) {
      exec("node freewill-debate.js", (err2, out2) => {
        if (err2) console.error("[Scheduler] Debate error:", err2.message)
        else      console.log("[Scheduler] Debate done\n" + out2)
      })
    }
  })
}

// First scheduled run after 6h (startup already handled in server.js)
setTimeout(() => {
  scanAll()
  setInterval(scanAll, INTERVAL_MS)
}, INTERVAL_MS)

console.log("Scheduler started — scanning every 6 hours")
