const API="/predictions"

async function load(){

 const res=await fetch(API)

 const data=await res.json()

 const container=
 document.getElementById("games")

 container.innerHTML=""

 data.forEach(g=>{

  const div=document.createElement("div")

  div.className="card"

  div.innerHTML=

  "<h3>"+g.match+"</h3>"+
  "<p>"+g.league+"</p>"+
  "<p>"+g.prediction+"</p>"+
  "<p>Over2.5 "+(g.probability.over25*100).toFixed(0)+"%</p>"+
  "<p>BTTS "+(g.probability.btts*100).toFixed(0)+"%</p>"

  container.appendChild(div)

 })

}

load()

setInterval(load,600000)

if("serviceWorker" in navigator){

 navigator.serviceWorker
 .register("sw.js")

}