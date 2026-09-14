const PARTY_KEY='champions-party-v1';
const BACKUP_KEY='champions-party-v1-backup';

function emptyTeam(){return Array(6).fill(null)}

function repairedTeam(value,validSet){
 const source=Array.isArray(value)?value:[];
 const names=new Set();
 let repaired=source.length!==6;
 const team=Array.from({length:6},(_,index)=>{
  const set=source[index];
  if(set===null||set===undefined)return null;
  if(!validSet(set)||names.has(set.name)){repaired=true;return null}
  names.add(set.name);return set;
 });
 return {team,repaired};
}

// A damaged slot must not discard the other five members of a saved team.
export function loadSavedTeams(storage,validSet,modes=['single','double']){
 const empty=Object.fromEntries(modes.map(mode=>[mode,emptyTeam()]));
 try{
  const raw=storage.getItem(PARTY_KEY);
  if(!raw)return {teams:empty,repaired:false};
  const saved=JSON.parse(raw);
  if(!saved||typeof saved!=='object')return {teams:empty,repaired:false};
  const results=Object.fromEntries(modes.map(mode=>[mode,repairedTeam(saved[mode],set=>validSet(set,mode))]));
  const repaired=Object.values(results).some(result=>result.repaired);
  if(repaired){
   storage.setItem(BACKUP_KEY,raw);
   storage.setItem(PARTY_KEY,JSON.stringify(Object.fromEntries(modes.map(mode=>[mode,results[mode].team]))));
  }
  return {teams:Object.fromEntries(modes.map(mode=>[mode,results[mode].team])),repaired};
 }catch{return {teams:empty,repaired:false}}
}

export function saveTeams(storage,teams){storage.setItem(PARTY_KEY,JSON.stringify(teams))}

export function partyExport(mode,date,team){return {version:1,mode,date,team}}
