// ══════════════════════════════════════════
//  AivsBookie — scheduler.js
//  Runs engine every 6 hours
// ══════════════════════════════════════════

const { exec } = require("child_process")

const INTERVAL_MS = 6 * 60 * 60 * 1000  // 6 hours

function scan() {
  console.log(`[Scheduler] Running scan at ${new Date().toISOString()}`)
  exec("node engine.js", (err, stdout) => {
    if (err) console.error("[Scheduler] Scan error:", err.message)
    else     console.log("[Scheduler] Scan complete\n" + stdout)
  })
}

// Start recurring scans after first boot scan in server.js
setTimeout(() => {
  scan()
  setInterval(scan, INTERVAL_MS)
}, INTERVAL_MS)

console.log("Scheduler started — scanning every 6 hours")
