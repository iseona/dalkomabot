import {calculateStats} from './engine.mjs';

const compact=value=>String(value||'').replace(/\s/g,'').normalize('NFD');
function distance(a,b){let previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]!==b[j-1]));previous=row;}return previous[b.length];}

// Only spelling similarity is used. No species, usage, recommended set or
// fixture answer is an input to this matcher.
export function matchRecognizedText(text, dictionary){
 const input=compact(text);if(!input)return null;
 const ranked=[...new Set(dictionary)].map(name=>({name,distance:distance(input,compact(name))})).sort((a,b)=>a.distance-b.distance);
 const first=ranked[0],second=ranked[1];
 if(!first)return null;
 if(first.distance===0)return {...first,exact:true};
 const limit=input.length>=9?2:1;
 if(first.distance>limit||second?.distance<=first.distance)return null;
 return {...first,exact:false};
}

export function speciesFromStats(master,stats,evs,nature){
 if(!Array.isArray(stats)||!Array.isArray(evs)||stats.length!==6||evs.length!==6||!nature)return [];
 if(stats.some(v=>!Number.isInteger(v)||v<1)||evs.some(v=>!Number.isInteger(v)||v<0||v>32)||evs.reduce((a,b)=>a+b,0)>66)return [];
 return master.pokemon.filter(row=>calculateStats(row.slice(3,9).map(Number),evs,nature).every((v,i)=>v===stats[i])).map(row=>row[0]);
}

export function resolveStatReadings(master,statReadings,evReadings,nature){
 if(!nature)return null;
 const solutions=[];
 for(const pokemon of master.pokemon){
  const choices=Array.from({length:6},(_,i)=>[...new Set(evReadings[i]||[])].filter(ev=>Number.isInteger(ev)&&ev>=0&&ev<=32&&(statReadings[i]||[]).includes(calculateStats(pokemon.slice(3,9).map(Number),Array.from({length:6},(_,j)=>j===i?ev:0),nature)[i])));
  if(choices.some(c=>!c.length))continue;
  const visit=(i,evs)=>{if(solutions.length>1)return;if(i===6){if(evs.reduce((a,b)=>a+b,0)<=66)solutions.push({name:pokemon[0],evs,stats:calculateStats(pokemon.slice(3,9).map(Number),evs,nature)});return;}for(const ev of choices[i])visit(i+1,[...evs,ev]);};visit(0,[]);
  if(solutions.length>1)return null;
 }
 return solutions.length===1?solutions[0]:null;
}
