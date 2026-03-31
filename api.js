const axios=require("axios")

const API="https://www.thesportsdb.com/api/v1/json/3"

async function getTodayMatches(){

 const today=new Date().toISOString().slice(0,10)

 const res=await axios.get(
 `${API}/eventsday.php?d=${today}&s=Soccer`
 )

 return res.data.events||[]

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