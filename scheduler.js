const cron = require("node-cron")
const { exec } = require("child_process")

console.log("Scheduler started")

/* RUN EVERY DAY AT 00:00 */
cron.schedule("30 09 * * *", () => {

 console.log("Daily scan started")

 exec("node engine.js", (err) => {

  if (err) {
   console.log("Scan error:", err)
  } else {
   console.log("Daily scan finished")
  }

 })

},{
 timezone: "Europe/Sofia"
})
