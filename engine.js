const fs=require("fs")
const {getTodayMatches,getLeagueTable}=require("./api")
const {matchProb}=require("./poisson")

function findTeam(table,name){

 const n=name.toLowerCase()

 return table.find(t=>
  t.strTeam.toLowerCase().includes(n) ||
  n.includes(t.strTeam.toLowerCase())
 )

}

async function run(){

 const matches=await getTodayMatches()

 const predictions=[]

 let scanned=0

 for(const m of matches){

  scanned++

  if(!m.idLeague) continue

  const table=await getLeagueTable(m.idLeague)

  if(!table.length) continue

  const home=findTeam(table,m.strHomeTeam)
  const away=findTeam(table,m.strAwayTeam)

  if(!home || !away) continue

  const hp=parseInt(home.intPlayed)
  const ap=parseInt(away.intPlayed)

  if(!hp || !ap) continue

  const homeAttack=home.intGoalsFor/hp
  const homeDefense=home.intGoalsAgainst/hp

  const awayAttack=away.intGoalsFor/ap
  const awayDefense=away.intGoalsAgainst/ap

  const homeXG=(homeAttack+awayDefense)/2
  const awayXG=(awayAttack+homeDefense)/2

  const probs=matchProb(homeXG,awayXG)

  predictions.push({

   league:m.strLeague,
   match:m.strHomeTeam+" vs "+m.strAwayTeam,
   prediction:"Over2.5 & BTTS",
   probability:probs,
   score:probs.combo

  })

 }

 predictions.sort((a,b)=>b.score-a.score)

 const top=predictions.slice(0,10)

 const output={

  last_scan:new Date().toISOString(),
  games_scanned:scanned,
  predictions:top

 }

 fs.writeFileSync(
  "predictions.json",
  JSON.stringify(output,null,2)
 )

 console.log("Scan finished")
 console.log("Games scanned:",scanned)

}

run()
