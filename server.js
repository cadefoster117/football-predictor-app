const express=require("express")
const fs=require("fs")
const {exec}=require("child_process")

require("./scheduler")

const app=express()

/* RUN SCAN ON START */
console.log("Running first scan...")

exec("node engine.js",(err)=>{

 if(err){
  console.log("Scan error:",err)
 }else{
  console.log("First scan finished")
 }

})

app.get("/",(req,res)=>{

 res.send("Football Prediction API Running")

})

app.get("/predictions",(req,res)=>{

 try{

  const data=
  fs.readFileSync("predictions.json")

  res.json(JSON.parse(data))

 }catch{

  res.json({
   last_scan:null,
   games_scanned:0,
   predictions:[]
  })

 }

})

const PORT=process.env.PORT||3000

app.listen(PORT,()=>{

 console.log("Server running on",PORT)

})
