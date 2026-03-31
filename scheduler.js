const cron=require("node-cron")
const {exec}=require("child_process")

cron.schedule("0 1 * * *",()=>{

 console.log("Updating predictions")

 exec("node engine.js")

})