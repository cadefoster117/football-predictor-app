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
const SIX_HOURS = 6 * 60 * 60 * 1000

// Only re-scan if file is missing or older than 6h
function isStale(filePath) {
  try { return (Date.now() - fs.statSync(filePath).mtimeMs) > SIX_HOURS }
  catch { return true }
}

app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())

// Pages
app.get("/",         (req,res) => res.sendFile(path.join(__dirname,"public/index.html")))
app.get("/history",  (req,res) => res.sendFile(path.join(__dirname,"public/history.html")))
app.get("/accas",    (req,res) => res.sendFile(path.join(__dirname,"public/accas.html")))
app.get("/freewill", (req,res) => res.sendFile(path.join(__dirname,"public/freewill.html")))

// API: predictions
app.get("/predictions", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/predictions.json")))) }
  catch { res.json({last_scan:null,games_scanned:0,candidates:0,ai_confirmed:0,predictions:[]}) }
})

// API: freewill predictions (all markets data)
app.get("/freewill-predictions", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/freewill-predictions.json")))) }
  catch { res.json({last_scan:null,games_scanned:0,games_in_24h:0,confirmed:0,top10:[]}) }
})

// API: freewill debate results
app.get("/freewill-debate", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/freewill-debate.json")))) }
  catch { res.json({last_scan:null,games_debated:0,passed:0,results:[]}) }
})

// API: save win/loss result
app.post("/api/result", (req,res) => {
  try {
    const { key, result } = req.body
    if (!key || !["WIN","LOSS","VOID"].includes(result))
      return res.status(400).json({error:"Invalid key or result"})
    const filePath = path.join(__dirname,"public/results.json")
    let results = {}
    try { results = JSON.parse(fs.readFileSync(filePath)) } catch {}
    results[key] = { result, updated_at: new Date().toISOString() }
    fs.writeFileSync(filePath, JSON.stringify(results,null,2))
    res.json({ok:true,key,result})
  } catch(err) { res.status(500).json({error:err.message}) }
})

// API: get all saved results
app.get("/api/results", (req,res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname,"public/results.json")))) }
  catch { res.json({}) }
})

// Manual triggers
app.get("/run-engine", (req,res) => {
  exec("node engine.js", (err,stdout,stderr) => {
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
  function age(p) {
    try { return Math.round((Date.now()-fs.statSync(p).mtimeMs)/60000)+"m ago" }
    catch { return "missing" }
  }
  res.json({
    predictions:  age(path.join(__dirname,"public/predictions.json")),
    freewill:     age(path.join(__dirname,"public/freewill-predictions.json")),
    debate:       age(path.join(__dirname,"public/freewill-debate.json")),
    llmapi_key:   process.env.LLMAPI_KEY ? "set" : "not set",
    bsd_token:    process.env.BSD_TOKEN  ? "set" : "not set"
  })
})

// Startup
require("./scheduler")

function runOnStartup() {
  const predPath = path.join(__dirname,"public/predictions.json")
  const fwPath   = path.join(__dirname,"public/freewill-predictions.json")

  if (isStale(predPath)) {
    console.log("▶ predictions stale — running main engine...")
    exec("node engine.js", (err,stdout) => {
      if(err) console.error("✗ Main engine:",err.message)
      else    console.log(stdout)
    })
  } else {
    console.log("✓ predictions fresh — skipping startup scan")
  }

  if (isStale(fwPath)) {
    console.log("▶ freewill stale — running FreeWill engine...")
    exec("node freewill-engine.js", (err,stdout) => {
      if(err) { console.error("✗ FreeWill:",err.message); return }
      console.log(stdout)
      if (process.env.LLMAPI_KEY) {
        console.log("▶ Running debate...")
        exec("node freewill-debate.js", (err2,out2) => {
          if(err2) console.error("✗ Debate:",err2.message)
          else     console.log(out2)
        })
      } else {
        console.log("⚠ LLMAPI_KEY not set — debate skipped")
      }
    })
  } else {
    console.log("✓ freewill fresh — skipping startup scan")
  }
}

app.listen(PORT, () => {
  console.log(`\n✓ AivsBookie on port ${PORT}`)
  runOnStartup()
})
