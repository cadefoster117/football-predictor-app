const historyData =
JSON.parse(
localStorage.getItem("history") || "[]"
)

const container =
document.getElementById("history")

historyData.forEach(h=>{

 const div =
 document.createElement("div")

 div.className="card"

 div.innerHTML=

 "<h3>"+h.match+"</h3>"+
 "<p>"+h.result+"</p>"

 container.appendChild(div)

})
