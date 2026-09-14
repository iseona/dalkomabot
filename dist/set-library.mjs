const KEY='champions-set-library-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
export function loadSetLibrary(storage,validate){try{const parsed=JSON.parse(storage.getItem(KEY)||'[]');if(!Array.isArray(parsed))return[];return parsed.filter(x=>x&&typeof x.id==='string'&&typeof x.mode==='string'&&validate(x.set,x.mode)).map(clone)}catch{return[]}}
export function saveSetLibrary(storage,entries){storage.setItem(KEY,JSON.stringify(entries.slice(0,100)))}
export function addSetsToLibrary(entries,sets,mode,now=Date.now()){const next=entries.map(clone);for(const set of sets.filter(Boolean)){const key=mode+'|'+set.name+'|'+JSON.stringify(set),found=next.find(x=>x.key===key);if(found){found.savedAt=now;continue}next.unshift({id:`${now}-${next.length}-${set.name}`,key,mode,savedAt:now,set:clone(set)})}return next.sort((a,b)=>b.savedAt-a.savedAt).slice(0,100)}
export function removeSetFromLibrary(entries,id){return entries.filter(x=>x.id!==id).map(clone)}
