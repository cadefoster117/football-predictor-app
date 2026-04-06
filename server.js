// ══════════════════════════════════════════
//  AivsBookie — server.js
// ══════════════════════════════════════════

require("dotenv").config()

const express  = require("express")
const fs       = require("fs")
const path     = require("path")
const { exec } = require("child_process")

const app  = express()
const PORT = process.env.PORT || 3000

const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000

// Check last_scan INSIDE the JSON — not file mtime.
// Render wipes files on restart so mtime is always "now".
// Reading last_scan from content survives redeploys as long
// as the file was written during this dyno session.
function isStale(filePath) {
  try {
    const raw  = fs.readFileSync(filePath, "utf8")
    const data = JSON.parse(raw)
    if (!data.last_scan) return true
    const age = Date.now() - new Date(data.last_scan).getTime()
    return age > TWENTY_THREE_HOURS
  } catch {
    return true // file missing or unreadable → needs a scan
  }
}

app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())

// ── Pages ───────────────────────────────────
app.get("/",         (req,res) => res.sendFile(path.join(__dirname,"public/index.html")))
app.get("/history",  (req,res) => res.sendFile(path.join(__dirname,"public/history.html")))
app.get("/accas",    (req,res) => res.sendFile(path.join(__dirname,"public/accas.html")))
app.get("/freewill", (req,res) => res.sendFile(path.join(__dirname,"public/freewill.html")))

// ── API: predictions ─────────────────────────
app.get("/predictions", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/predictions.json")))) }
  catch { res.json({last_scan:null,games_scanned:0,candidates:0,ai_confirmed:0,predictions:[]}) }
})

// ── API: accas ───────────────────────────────
app.get("/api/accas", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/accas.json")))) }
  catch { res.json({last_scan:null,date_label:null,accas:[]}) }
})

// ── API: freewill predictions ────────────────
app.get("/freewill-predictions", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/freewill-predictions.json")))) }
  catch { res.json({last_scan:null,games_scanned:0,games_in_24h:0,confirmed:0,top10:[]}) }
})

// ── API: freewill debate ─────────────────────
app.get("/freewill-debate", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/freewill-debate.json")))) }
  catch { res.json({last_scan:null,games_debated:0,passed:0,results:[]}) }
})

// ── API: win/loss results ────────────────────
app.post("/api/result", (req,res) => {
  try {
    const { key, result } = req.body
    if (!key || !["WIN","LOSS","VOID"].includes(result))
      return res.status(400).json({error:"Invalid key or result"})
    const fp = path.join(__dirname,"public/results.json")
    let results = {}
    try { results = JSON.parse(fs.readFileSync(fp)) } catch {}
    results[key] = { result, updated_at: new Date().toISOString() }
    fs.writeFileSync(fp, JSON.stringify(results,null,2))
    res.json({ok:true,key,result})
  } catch(err) { res.status(500).json({error:err.message}) }
})

app.get("/api/results", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/results.json")))) }
  catch { res.json({}) }
})

// ── Manual triggers ──────────────────────────
app.get("/run-engine", (req,res) => {
  exec("node engine.js", (err,stdout,stderr) => {
    if(err) return res.status(500).json({error:err.message,stderr})
    res.json({ok:true,output:stdout})
  })
})

app.get("/run-accas", (req,res) => {
  exec("node accas-engine.js", (err,stdout,stderr) => {
    if(err) return res.status(500).json({error:err.message,stderr})
    res.json({ok:true,output:stdout})
  })
})

app.get("/run-freewill", (req,res) => {
  exec("node freewill-engine.js", (err,stdout,stderr) => {
    if(err) return res.status(500).json({error:err.message,stderr})
    res.json({ok:true,output:stdout})
  })
})

app.get("/run-freewill-debate", (req,res) => {
  exec("node freewill-engine.js", (err1,out1) => {
    if(err1) return res.status(500).json({error:"freewill-engine failed: "+err1.message})
    exec("node freewill-debate.js", (err2,out2) => {
      if(err2) return res.status(500).json({error:"debate failed: "+err2.message,output:out1})
      res.json({ok:true,output:out1+"\n"+out2})
    })
  })
})

app.get("/status", (req,res) => {
  function scanAge(p) {
    try {
      const d = JSON.parse(fs.readFileSync(p))
      if (!d.last_scan) return "no scan yet"
      const mins = Math.round((Date.now() - new Date(d.last_scan).getTime()) / 60000)
      return mins + "m ago"
    } catch { return "missing" }
  }
  res.json({
    predictions: scanAge(path.join(__dirname,"public/predictions.json")),
    accas:       scanAge(path.join(__dirname,"public/accas.json")),
    freewill:    scanAge(path.join(__dirname,"public/freewill-predictions.json")),
    debate:      scanAge(path.join(__dirname,"public/freewill-debate.json")),
    timezone:    process.env.SCAN_TIMEZONE || "Europe/Sofia",
    llmapi_key:  process.env.LLMAPI_KEY ? "set" : "not set",
    bsd_token:   process.env.BSD_TOKEN   ? "set" : "not set"
  })
})

// ── Startup: only run engines if last_scan is old ──
// Uses last_scan inside JSON — survives Render restarts
// without re-running engines unnecessarily.

function runOnStartup() {
  const tz = process.env.SCAN_TIMEZONE || "Europe/Sofia"
  console.log(`  Timezone : ${tz}`)
  console.log(`  LLMAPI   : ${process.env.LLMAPI_KEY ? "✓" : "✗ not set"}`)
  console.log(`  BSD      : ${process.env.BSD_TOKEN  ? "✓" : "✗ not set"}\n`)

  const predPath  = path.join(__dirname,"public/predictions.json")
  const accasPath = path.join(__dirname,"public/accas.json")
  const fwPath    = path.join(__dirname,"public/freewill-predictions.json")

  if (isStale(predPath)) {
    console.log("▶ predictions stale — running main engine...")
    exec("node engine.js", (err) => {
      if(err) console.error("✗ Main engine:",err.message)
      else    console.log("✓ Main engine done")
    })
  } else {
    console.log("✓ predictions up to date — skipping main engine")
  }

  if (isStale(accasPath)) {
    console.log("▶ accas stale — running accas engine...")
    exec("node accas-engine.js", (err) => {
      if(err) console.error("✗ Accas engine:",err.message)
      else    console.log("✓ Accas engine done")
    })
  } else {
    console.log("✓ accas up to date — skipping accas engine")
  }

  if (isStale(fwPath)) {
    console.log("▶ freewill stale — running FreeWill engine...")
    exec("node freewill-engine.js", (err) => {
      if(err) { console.error("✗ FreeWill:",err.message); return }
      console.log("✓ FreeWill engine done")
      if (process.env.LLMAPI_KEY) {
        exec("node freewill-debate.js", (err2) => {
          if(err2) console.error("✗ Debate:",err2.message)
          else     console.log("✓ Debate done")
        })
      } else {
        console.log("⚠ LLMAPI_KEY not set — debate skipped")
      }
    })
  } else {
    console.log("✓ freewill up to date — skipping FreeWill engine")
  }
}

require("./scheduler")

app.listen(PORT, () => {
  console.log(`\n✓ AivsBookie on port ${PORT}`)
  runOnStartup()
})
