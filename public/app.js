async function loadPredictions(){

 try{

  const res=await fetch("/predictions")

  const data=await res.json()

  const container=document.getElementById("games")
  const info=document.getElementById("info")

  if(info){

   info.innerHTML=
   "Last scan: "+data.last_scan+
   " | Games scanned: "+data.games_scanned

  }

  if(!data.predictions || data.predictions.length===0){

   container.innerHTML="No predictions today."
   return

  }

  let html=""

  data.predictions.forEach(p=>{

   html+=`

   <div class="game">

    <h3>${p.match}</h3>

    <p>${p.league}</p>

    <p>${p.date} | ${p.time}</p>

    <p><b>${p.prediction}</b></p>

    <p>
    Over2.5: ${(p.probability.over25*100).toFixed(1)}% |
    BTTS: ${(p.probability.btts*100).toFixed(1)}%
    </p>

   </div>

   `

  })

  container.innerHTML=html

 }catch(e){

  console.log("App error:",e)

 }

}

loadPredictions()

setInterval(loadPredictions,60000)
