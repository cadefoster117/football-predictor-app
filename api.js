const axios=require("axios")

const API="https://www.thesportsdb.com/api/v1/json/3"

function formatDate(d){

 return d.toISOString().slice(0,10)

}

async function getMatchesForDate(date){

 const res=await axios.get(
 `${API}/eventsday.php?d=${date}&s=Soccer`
 )

 return res.data.events||[]

}

async function getTodayMatches(){

 const today=new Date()

 const yesterday=new Date(today)
 yesterday.setDate(today.getDate()-1)

 const tomorrow=new Date(today)
 tomorrow.setDate(today.getDate()+1)

 const matches=[

  ...(await getMatchesForDate(formatDate(yesterday))),
  ...(await getMatchesForDate(formatDate(today))),
  ...(await getMatchesForDate(formatDate(tomorrow)))

 ]

 return matches

}

async function getLeagueTable(id){

 try{

  const res=await axios.get(
   `${API}/lookuptable.php?l=${id}&s=2024-2025`
  )

  return res.data.table||[]

 }catch{

  return[]

 }

}

module.exports={
 getTodayMatches,
 getLeagueTable
}
