const MAX_FILES=4,MAX_SOURCE_BYTES=15*1024*1024,MAX_EDGE=1600,REQUEST_TIMEOUT_MS=55000;

function deadline(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(message)),ms))]).finally(()=>clearTimeout(timer))}
function dataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader;reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('이미지를 읽지 못했습니다.'));reader.readAsDataURL(blob)})}

export function validateRecognitionResult(value){
 if(!value||value.schemaVersion!==1||!['party','lead'].includes(value.kind))throw Error('AI 인식 응답 형식이 올바르지 않습니다.');
 const text=v=>typeof v==='string'?v.trim():'';
 const nullable=v=>v===null?'':text(v);
 const slots=(items,label='슬롯')=>{
  if(!Array.isArray(items)||items.length!==6)throw Error('AI 인식 응답 형식이 올바르지 않습니다.');
  return items.map((slot,index)=>{
  if(!slot||slot.slot!==index+1||!Array.isArray(slot.moves)||slot.moves.length>4||!Array.isArray(slot.evs)||slot.evs.length!==6)throw Error(`AI 인식 ${index+1}번 슬롯이 잘못되었습니다.`);
  const evs=slot.evs.map(v=>v===null?null:Number(v));if(evs.some(v=>v!==null&&(!Number.isInteger(v)||v<0||v>32)))throw Error(`AI 인식 ${index+1}번 배분이 범위를 벗어났습니다.`);
  return {slot:index+1,name:nullable(slot.name),item:nullable(slot.item),ability:nullable(slot.ability),nature:nullable(slot.nature),moves:slot.moves.map(text).filter(Boolean).slice(0,4),evs,confidence:Math.max(0,Math.min(1,Number(slot.confidence)||0)),notes:text(slot.notes)};
  });
 };
 if(value.kind==='lead'){
  if(!value.sides||typeof value.sides!=='object')throw Error('AI 선출 인식 응답 형식이 올바르지 않습니다.');
  value.sides={mine:slots(value.sides.mine),opp:slots(value.sides.opp)};
 }else value.slots=slots(value.slots);
 return value;
}

async function compactImage(file){
 if(!file||file.size>MAX_SOURCE_BYTES||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('각 파일은 15MB 이하 PNG, JPG, WebP여야 합니다.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob)throw Error('이미지를 변환하지 못했습니다.');return dataUrl(blob);
}

export async function recognizeImages({files,mode,kind='party',endpoint=globalThis.DALKOMA_CONFIG?.recognitionEndpoint,fetchImpl=fetch}){
 const selected=[...files];if(!selected.length)throw Error('인식할 이미지를 선택해 주세요.');if(selected.length>MAX_FILES)throw Error(`이미지는 최대 ${MAX_FILES}장까지 한 번에 인식합니다.`);if(!endpoint)throw Error('AI 인식 서버 주소가 설정되지 않았습니다.');
 const images=[];for(const file of selected)images.push(await compactImage(file));
 const response=await deadline(fetchImpl(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,kind,images})}),REQUEST_TIMEOUT_MS,'AI 이미지 인식이 55초를 초과했습니다.');
 let body;try{body=await response.json()}catch{throw Error('AI 인식 서버의 응답을 읽지 못했습니다.')}if(!response.ok)throw Error(body?.error||`AI 인식 요청이 실패했습니다 (${response.status}).`);return validateRecognitionResult(body);
}
