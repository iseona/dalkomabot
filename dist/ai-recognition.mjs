import {buildLeadContactSheet,buildPartyContactSheet,buildPartyCandidateLegend,readPartyNatureArrows,buildPartyTextSheet,buildPartyPortraitSheet} from './recognition-contact-sheet.mjs';

// Allow the Lambda's 120-second execution window plus transfer/response time.
const MAX_FILES=4,MAX_SOURCE_BYTES=15*1024*1024,MAX_EDGE=2560,REQUEST_TIMEOUT_MS=135000;

const recognitionCache = new Map();
const pendingRequests = new Map();

async function requestKey(files, mode, kind, endpoint, allowAI) {
 const hashes=[];
 for(const file of files){
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  hashes.push(Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join(''));
 }
 return JSON.stringify(['recognition-cards-v4',endpoint,mode,kind,Boolean(allowAI),hashes]);
}

let legendPromise;
async function pokemonIconLegend(){
 if(!legendPromise)legendPromise=fetch('pokemon-icon-legend.jpg').then(async response=>{
  if(!response.ok)throw Error('포켓몬 아이콘 기준표를 불러오지 못했습니다.');
  const blob=await response.blob();
  return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('포켓몬 아이콘 기준표를 읽지 못했습니다.'));reader.readAsDataURL(blob)});
 });
 return legendPromise;
}

function deadline(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer))}

export function validateRecognitionResult(value){
 if(!value||value.schemaVersion!==1||!['party','lead'].includes(value.kind))throw Error('AI 인식 응답 형식이 올바르지 않습니다.');
 const text=v=>typeof v==='string'?v.trim():'';
 const nullable=v=>v===null?'':text(v);
 const slots=(items,label='슬롯')=>{
  if(!Array.isArray(items)||items.length!==6)throw Error('AI 인식 응답 형식이 올바르지 않습니다.');
  return items.map((slot,index)=>{
  if(!slot||slot.slot!==index+1||!Array.isArray(slot.moves)||slot.moves.length>4||!Array.isArray(slot.evs)||slot.evs.length!==6)throw Error(`AI 인식 ${index+1}번 슬롯이 잘못되었습니다.`);
  const evs=slot.evs.map(v=>v===null?null:Number(v));if(evs.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>32)))throw Error(`AI 인식 ${index+1}번 배분이 범위를 벗어났습니다.`);
  return {slot:index+1,name:nullable(slot.name),item:nullable(slot.item),ability:nullable(slot.ability),nature:nullable(slot.nature),moves:slot.moves.map(text).slice(0,4),evs,confidence:Math.max(0,Math.min(1,Number(slot.confidence)||0)),notes:text(slot.notes)};
  });
 };
 if(value.kind==='lead'){
  if(!value.sides||typeof value.sides!=='object')throw Error('AI 선출 인식 응답 형식이 올바르지 않습니다.');
  value.sides={mine:slots(value.sides.mine),opp:slots(value.sides.opp)};
 }else value.slots=slots(value.slots);
 return value;
}

async function recognizeImagesOnce({files,mode,kind='party',endpoint=globalThis.DALKOMA_CONFIG?.recognitionEndpoint,fetchImpl=fetch,leadRectDetector,partyCandidates,leadCandidates,allowAI=false}){
 const selected=[...files];if(!selected.length)throw Error('인식할 이미지를 선택해 주세요.');if(selected.length>MAX_FILES)throw Error(`이미지는 최대 ${MAX_FILES}장까지 한 번에 인식합니다.`);
 let localText=null,localModule=null;
 if(kind==='party'){
  localModule=await import('./local-party-text.mjs');
  try{localText=await localModule.readLocalPartyText(selected);}catch(error){console.warn('Local party text unavailable:',error.message);}
  if(localText&&(!allowAI||localText.every(s=>s.name&&s.item&&s.ability&&s.nature&&s.moves.every(Boolean)&&s.evs.every(Number.isInteger)))){
   return {schemaVersion:1,kind:'party',source:'local',slots:localText.map(s=>({...s,item:s.item||'',ability:s.ability||'',confidence:s.name?1:0,nameEvidence:s.name?'six-stat-equations':'',notes:s.name?'원본 글자 및 능력치 6개 계산 일치 · AI 호출 없음':'원본에서 읽은 값만 표시했습니다. 미확인 값은 비워 두었습니다. · AI 호출 없음'})),sides:{mine:[],opp:[]}};
  }
  if(!allowAI)throw Error('로컬 인식기를 불러오지 못했습니다. 연결을 확인하거나 AI 보조 버튼을 눌러 주세요.');
 }
 if(!endpoint)throw Error('일부 값을 로컬에서 확인하지 못했습니다. AI 인식 서버 주소가 설정되지 않았습니다.');
 if(kind==='lead'&&typeof leadRectDetector!=='function')throw Error('선출 카드 위치 감지기가 필요합니다.');
 const images=kind==='lead'?[...await Promise.all(selected.map(async file=>(await buildLeadContactSheet(file,leadRectDetector)).dataUrl)),await pokemonIconLegend()]:[(await buildPartyContactSheet(selected)).dataUrl];
 if(kind==='party'){const text=await buildPartyTextSheet(selected);if(text)images.push(text);}
 if(kind==='party')images.push(await buildPartyPortraitSheet(selected[0]));
 if(kind==='lead'&&selected.length===1&&leadCandidates){const mine=await buildPartyCandidateLegend(leadCandidates.mine,'좌'),opp=await buildPartyCandidateLegend(leadCandidates.opp,'우');if(mine&&opp)images.splice(1,0,mine,opp);}
 const response=await deadline(fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,kind,images})}),REQUEST_TIMEOUT_MS,'AI 이미지 인식이 135초를 초과했습니다.');
 let body;try{body=await response.json()}catch{throw Error('AI 인식 서버의 응답을 읽지 못했습니다.')}if(!response.ok)throw Error(body?.error||`AI 인식 요청이 실패했습니다 (${response.status}).`);
 const result=validateRecognitionResult(body);
 if(kind==='party'&&localText)result.slots=localModule.applyLocalPartyText(result.slots,localText);
 if(kind==='party'){
  const observations=[];
  for(const file of selected){const bitmap=await createImageBitmap(file);try{observations.push(readPartyNatureArrows(bitmap));}finally{bitmap.close();}}
  const {master}=await(await fetch(new URL('./data.json',import.meta.url))).json();
  result.slots.forEach((slot,i)=>{
   const pairs=[...new Set(observations.map(rows=>rows[i]).filter(Boolean).map(p=>`${p.up}/${p.down}`))];
   slot.nature=pairs.length===1?(master.natures.find(n=>`${n[2]}/${n[3]}`===pairs[0])?.[0]||''):'';
  });
 }
 return result;
}

export async function recognizeImages(options) {
 const files=[...options.files];
 if(!files.length || files.length>MAX_FILES || files.some(file=>!file || file.size>MAX_SOURCE_BYTES
   || !/^image\/(png|jpeg|webp)$/.test(file.type))) throw Error('15MB 이하 이미지 1~4장을 선택해 주세요.');
 const endpoint=options.endpoint ?? globalThis.DALKOMA_CONFIG?.recognitionEndpoint;
 const key=await requestKey(files,options.mode,options.kind||'party',endpoint,options.allowAI);
 if(recognitionCache.has(key))return structuredClone(recognitionCache.get(key));
 if(pendingRequests.has(key))return structuredClone(await pendingRequests.get(key));
 const request=recognizeImagesOnce({...options,files,endpoint});
 pendingRequests.set(key,request);
 try {
  const result=await request;
  const slots=result.kind==='lead'?[...result.sides.mine,...result.sides.opp]:result.slots;
  // Do not trap a partial/uncertain response in the cache.
  if(slots.every(slot=>slot.name && slot.confidence>=.8)){
   recognitionCache.set(key,structuredClone(result));
   if(recognitionCache.size>16)recognitionCache.delete(recognitionCache.keys().next().value);
  }
  return structuredClone(result);
 } finally {pendingRequests.delete(key);}
}
