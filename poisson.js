function factorial(n){

 if(n===0) return 1

 return n*factorial(n-1)

}

function poisson(k,lambda){

 return (Math.pow(lambda,k)*Math.exp(-lambda))/factorial(k)

}

function matchProb(homeXG,awayXG){

 let over25=0
 let btts=0
 let combo=0

 for(let i=0;i<=6;i++){

  for(let j=0;j<=6;j++){

   const p=
   poisson(i,homeXG)*poisson(j,awayXG)

   if(i+j>=3) over25+=p

   if(i>0 && j>0) btts+=p

   if(i+j>=3 && i>0 && j>0) combo+=p

  }

 }

 return{over25,btts,combo}

}

module.exports={matchProb}