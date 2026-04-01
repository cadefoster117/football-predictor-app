const fs=require("fs")
const axios=require("axios")

const API="https://sports.bzzoiro.com/api/predictions/?upcoming=true"

const TOKEN="c856e7f4def835bb1b2e448e6ccda8b47ed188ac"

async function run(){

 const res=await axios.get(API,{
  headers:{
   Authorization:`Token ${TOKEN}`
  }
 })

 const data=res.data.results

 const predictions=[]

 for(const p of data){

  const over=p.prob_over_25/100
  const btts=p.prob_btts_yes/100

  const combo=over*btts

  const kickoff = new Date(p.event.start_time)

predictions.push({

 league: p.event.league?.name || "Unknown",

 match: p.event.home_team+" vs "+p.event.away_team,

 date: kickoff.toLocaleDateString(),

 time: kickoff.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),

 prediction:"Over2.5 & BTTS",
   probability:{
    over25:over,
    btts:btts,
    combo:combo
   },

   confidence:p.confidence,
   score:combo

  })

 }

 predictions.sort((a,b)=>b.score-a.score)

 const top=predictions.slice(0,10)

 const output={

  engine:"BSD ML v4",
  last_scan:new Date().toISOString(),
  games_scanned:data.length,
  predictions:top

 }

 fs.writeFileSync(
  "predictions.json",
  JSON.stringify(output,null,2)
 )

 console.log("Games scanned:",data.length)
 console.log("Top predictions:",top.length)

}

run()
