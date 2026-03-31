const express=require("express")
const fs=require("fs")

require("./scheduler")

const app=express()

app.get("/",(req,res)=>{

 res.send("Football Prediction API Running")

})

app.get("/predictions",(req,res)=>{

 try{

  const data=fs.readFileSync("predictions.json")

  res.json(JSON.parse(data))

 }catch{

  res.json([])

 }

})

const PORT=process.env.PORT||3000

app.listen(PORT,()=>{

 console.log("Server running on",PORT)

})