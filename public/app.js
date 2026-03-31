const API =
"https://football-predictor-chatgpt.onrender.com/predictions"

async function loadPredictions(){

 const res =
 await fetch(API)

 const games =
 await res.json()

 const container =
 document.getElementById("predictions")

 container.innerHTML=""

 games.forEach(g=>{

  const div =
  document.createElement("div")

  div.className="card"

  div.innerHTML=

  "<h3>"+g.match+"</h3>"+
  "<p>"+g.league+"</p>"+
  "<p>"+g.prediction+"</p>"+
  "<p>Over2.5: "+(g.probability.over25*100).toFixed(0)+"%</p>"+
  "<p>BTTS: "+(g.probability.btts*100).toFixed(0)+"%</p>"

  container.appendChild(div)

 })

}

loadPredictions()

if("serviceWorker" in navigator){

 navigator.serviceWorker
 .register("sw.js")

}
