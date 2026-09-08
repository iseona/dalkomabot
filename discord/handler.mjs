import {createPublicKey,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {recommend,draft,makeSet,evText,total,validSet,battleCalculation,koreanType,strongestStatMove,damageScenarioResults,speedVariants} from './engine.mjs';
const D=JSON.parse(readFileSync(new URL('./data.json',import.meta.url)));
let O=JSON.parse(readFileSync(new URL('./opendata.json',import.meta.url)));
let loadedAt=0;
async function refreshOpen(){
 // Only our own cached app file is read, never the upstream data provider.
 if(!process.env.APP_URL||Date.now()-loadedAt<300000)return;
 try{const url=new URL('opendata.json',process.env.APP_URL);const r=await fetch(url,{signal:AbortSignal.timeout(700),redirect:'error'});if(!r.ok)return;const next=await r.json();const allowed=new Set(D.master.pokemon.map(p=>p[0]));if(!['single','double'].every(m=>next.modes?.[m]?.season==='M-4'&&Array.isArray(next.modes[m].teams)&&next.modes[m].teams.every(t=>Array.isArray(t.team)&&t.team.length===6&&t.team.every(p=>allowed.has(p.name)))))return;O=next;loadedAt=Date.now()}catch{}
}
const response=(code,data)=>({statusCode:code,headers:{'content-type':'application/json'},body:JSON.stringify(data)});
const reply=(content,ephemeral=true)=>response(200,{type:4,data:{content:content.slice(0,1950),...(ephemeral?{flags:64}:{}),allowed_mentions:{parse:[]}}});
const baseStats=name=>{const p=D.master.pokemon.find(x=>x[0]===name);return p?`H${p[3]} A${p[4]} B${p[5]} C${p[6]} D${p[7]} S${p[8]} (합 ${p[9]})`:'정보 없음'};
const openRate=(mode,name)=>O.modes[mode].frequency.find(x=>x.name===name)?.rate??0;
export async function handler(event){
 const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
 const ts=headers['x-signature-timestamp'],sig=headers['x-signature-ed25519'];
 const raw=Buffer.from(event.body||'',event.isBase64Encoded?'base64':'utf8');
 if(raw.length>1000000)return response(413,{error:'Too large'});
 try{
  if(!/^\d+$/.test(ts||'')||Math.abs(Date.now()/1000-Number(ts))>300||!/^([a-f0-9]{128})$/i.test(sig||'')||!/^([a-f0-9]{64})$/i.test(process.env.DISCORD_PUBLIC_KEY||''))return response(401,{error:'Invalid signature'});
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(process.env.DISCORD_PUBLIC_KEY,'hex')]),format:'der',type:'spki'});
  if(!verify(null,Buffer.concat([Buffer.from(ts),raw]),key,Buffer.from(sig,'hex')))return response(401,{error:'Invalid signature'});
 }catch{return response(401,{error:'Invalid signature'})}
 let it;try{it=JSON.parse(raw)}catch{return response(400,{error:'Invalid JSON'})}
 if(it.type===1)return response(200,{type:1});
 if(it.type===4){
 const options=it.data?.options||[],mode=options.find(x=>x.name==='모드')?.value||'single',rows=D.modes[mode]||D.modes.single;
 await refreshOpen();
  const focused=options.find(x=>x.focused),query=String(focused?.value||'').trim();let choices=[];
  if(it.data.name==='계산기'&&focused?.name==='기술'){
   const attacker=rows.find(p=>p.name===options.find(x=>x.name==='공격포켓몬')?.value);
   choices=(attacker?.moves||[]).map(x=>{const m=D.master.moves.find(m=>m[0]===x.name);return m&&m[3]!=='변화'&&Number(m[4])>0?{move:m,rate:x.rate}:null}).filter(Boolean).filter(x=>!query||x.move[0].includes(query)).slice(0,25).map(x=>({name:`${x.move[0]} · ${koreanType[x.move[2]]||x.move[2]} · 위력 ${x.move[4]} · ${x.rate}%`,value:x.move[0]}));
  }else choices=rows.filter(p=>!query||p.name.includes(query)).slice(0,25).map(p=>({name:`${p.name} · ${p.rank}위 · 공개파티 ${openRate(mode,p.name)}%`,value:p.name}));
  return response(200,{type:8,data:{choices}});
 }
 if(it.type!==2)return reply('지원하지 않는 명령입니다.');
 const opt=Object.fromEntries((it.data.options||[]).map(x=>[x.name,x.value]));const mode=opt['모드']||'single';
 if(!['single','double'].includes(mode))return reply('싱글 또는 더블을 선택해 주세요.');
 const rows=D.modes[mode],label=mode==='single'?'싱글':'더블';
 await refreshOpen();
 const evidence=`상세 세팅 ${D.date} · 공개 파티 ${O.modes[mode].updatedAt} (JST)\n`;
 if(it.data.name==='웹앱')return reply('**포챔스 달콤아 봇**\n'+(process.env.APP_URL||'웹앱 주소가 아직 설정되지 않았습니다.'));
 if(it.data.name==='명령어')return reply('**포챔스 달콤아 봇 명령어**\n`/메타` 메타 순위·포켓몬 상세 통계\n`/샘플` 포켓몬의 최상위 통계 세팅\n`/추천` 현재 멤버와 함께 쓸 후보 추천\n`/파티` 고정 멤버를 포함한 6마리 파티 초안\n`/결정력계산기` 최고 결정력 기술의 내구별 타수\n`/스피드계산기` 최속·준속·무보정·스카프 비교\n`/계산기` 기술·방어 배분 직접 선택 계산\n`/웹앱` 포챔스 달콤아 봇 웹앱 링크\n`/스크린샷` 이미지 인식 기능 안내\n`/명령어` 이 목록을 채널에 공개',false);
 if(it.data.name==='메타'){
  const name=opt['포켓몬'];if(!name){return reply(evidence+`**${label} 공개 파티 표본 내 채용 비율**\n`+O.modes[mode].frequency.slice(0,8).map(f=>`${f.name}: ${f.rate}% (${f.count}/${O.modes[mode].count}파티)`).join('\n')+'\n전체 랭크배틀 사용률이 아닙니다.')}
  const p=rows.find(p=>p.name===name);if(!p)return reply('첨부 데이터에 해당 정보가 없습니다. 공식 한글 이름을 확인해 주세요.');
  return reply(evidence+`**${p.name} · 첨부 ${label} ${p.rank}위**\n`+[['도구','items'],['특성','abilities'],['성격','natures'],['기술','moves'],['배분','evs']].map(([label,k])=>label+': '+p[k].slice(0,k==='moves'?4:2).map(x=>x.name+' '+x.rate+'%'+(k==='evs'?' (합계 '+total(x.name.match(/\d+/g).map(Number))+' ✓)':'')).join(' / ')).join('\n')+'\n각 채용률은 독립 집계이며 완성 세트 채용률이 아닙니다.')
 }
 if(it.data.name==='샘플'){
  const name=opt['포켓몬'],p=rows.find(x=>x.name===name);if(!p)return reply('포켓몬 후보에서 공식 한글 이름을 선택해 주세요.');
  return reply(evidence+`**${p.name} · ${label} ${p.rank}위 · 공개파티 ${openRate(mode,p.name)}%**\n종족값: ${baseStats(p.name)}\n특성: ${p.abilities[0]?.name||'정보 없음'} ${p.abilities[0]?.rate??'—'}%\n도구: ${p.items[0]?.name||'정보 없음'} ${p.items[0]?.rate??'—'}%\n성격: ${p.natures[0]?.name||'정보 없음'} ${p.natures[0]?.rate??'—'}%\n배분: ${p.evs[0]?.name||'정보 없음'} ${p.evs[0]?.rate??'—'}%\n기술: ${p.moves.slice(0,4).map(x=>`${x.name} ${x.rate}%`).join(' / ')}\n각 항목의 채용률 1위를 조합한 참고 샘플이며 실제 한 세트의 동시 채용률은 아닙니다.`);
 }
 const names=String(opt['포켓몬']||'').split(',').map(n=>n.trim()).filter(Boolean);
 if(names.length>6||new Set(names).size!==names.length||names.some(n=>!rows.some(p=>p.name===n)))return reply('중복 없이 최대 6마리의 공식 한글 이름을 쉼표로 구분해 주세요. 첨부 통계에 없는 이름은 사용할 수 없습니다.');
 if(it.data.name==='추천')return reply(evidence+'**함께 쓸 후보**\n'+recommend(rows,O.modes[mode],names,D.master).slice(0,5).map(({p,teammateEvidence,assessment})=>`**${p.name}** ${p.rank}위 · 공개파티 ${openRate(mode,p.name)}%\n종족값 ${baseStats(p.name)}\n팀메이트 ${teammateEvidence.map(x=>x.name+(x.direct?' '+x.direct+'위':'')).join(', ')||'직접 기록 없음'}\n보완 ${assessment.repaired.map(x=>x.type).join(', ')||'없음'} · 타입 대응 ${assessment.gains.slice(0,3).map(x=>x.name).join(', ')||'확인 안 됨'} · 실전 처치 대응 ${assessment.empirical.covered.slice(0,3).map(x=>x.name).join(', ')||'확인 안 됨'}\n${p.items[0]?.name||'도구 없음'} ${p.items[0]?.rate??'—'}% · ${p.natures[0]?.name||'성격 없음'} ${p.natures[0]?.rate??'—'}%\n${p.moves.slice(0,4).map(x=>`${x.name} ${x.rate}%`).join(' / ')}`).join('\n\n')+'\n추천 점수는 예상 승률이 아닙니다.');
 if(it.data.name==='파티'){
  const result=draft(rows,O.modes[mode],names,D.master);if(!result.every(s=>validSet(s,rows)))return reply('검증을 통과하는 세팅이 부족합니다. 웹앱에서 확인해 주세요.');
  return reply(evidence+'**6마리 파티 초안**\n'+result.map(s=>`**${s.name}** (첨부 ${rows.find(p=>p.name===s.name).rank}위)\n${s.items||'도구 미선택'} / ${s.abilities} / ${s.natures}\n${s.moves.join(' / ')}\n${evText(s.evs)} (합계 ${total(s.evs)} ✓)`).join('\n\n')+'\n개별 통계 조합 초안입니다. 상세 채용률은 /메타로 확인하세요.');
 }
 if(it.data.name==='계산기'){
  const attacker=rows.find(p=>p.name===opt['공격포켓몬']),defender=rows.find(p=>p.name===opt['방어포켓몬']),move=D.master.moves.find(m=>m[0]===opt['기술']);
  if(!attacker||!defender)return reply('공격·방어 포켓몬을 자동완성 후보에서 선택해 주세요.');
  if(!move||!attacker.moves.some(x=>x.name===move[0])||move[3]==='변화'||Number(move[4])<=0)return reply('공격 포켓몬의 통계에 등재된 공격 기술을 자동완성 후보에서 선택해 주세요.');
  const set=makeSet(attacker),bulk={zero:[0,0,0,0,0,0],hp:[32,0,0,0,0,0],physical:[32,0,32,0,0,0],special:[32,0,0,0,32,0]},bulkLabel={zero:'H0 · B/D0',hp:'H32 · B/D0',physical:'H32 · B32',special:'H32 · D32'},bulkKey=opt['방어배분']||'zero',calc=battleCalculation(attacker,defender,set,move,bulk[bulkKey]||bulk.zero,D.master);
  if(!calc)return reply('현재 챔피언스 데이터로 계산할 수 없는 조합입니다.');
  const r=calc.result,stats=x=>`H${x[0]} A${x[1]} B${x[2]} C${x[3]} D${x[4]} S${x[5]}`;
  return reply(evidence+`**${attacker.name} → ${defender.name}**\n**${move[0]}** · ${calc.type} · ${calc.category} · 위력 ${move[4]}\n데미지 **${r.min}~${r.max} (${r.minPct}~${r.maxPct}%)** · **${r.label}**\n자속 ×${calc.stab} · 타입상성 ×${calc.typeMultiplier} · 도구 ×${calc.itemMultiplier} · 특성 ×${calc.abilityMultiplier}\n\n**공격 세팅(각 항목 통계 1위 조합)**\n${set.items||'도구 없음'} / ${set.abilities||'특성 없음'} / ${set.natures||'성격 없음'}\n${evText(set.evs)} · ${stats(calc.attackerStats)}\n결정력 지수 ${calc.powerIndex.toLocaleString()} · 물리내구 ${calc.physicalBulk.toLocaleString()} · 특수내구 ${calc.specialBulk.toLocaleString()} · 스피드 ${calc.speed}\n\n**방어 기준** ${bulkLabel[bulkKey]||bulkLabel.zero} · 무보정 성격\n${stats(calc.defenderStats)}\n86~100의 15난수 기준. 명중률·급소·날씨·필드·랭크·벽·조건부 효과·연속기 횟수·가변 위력·더블 광역 보정은 제외합니다.`);
 }
 if(it.data.name==='결정력계산기'){
  const attacker=rows.find(p=>p.name===opt['공격포켓몬']),defender=rows.find(p=>p.name===opt['방어포켓몬']);if(!attacker||!defender)return reply('공격·방어 포켓몬을 자동완성 후보에서 선택해 주세요.');const set=makeSet(attacker),best=strongestStatMove(attacker,defender,set,D.master);if(!best)return reply('채용률 상위 4개 기술에서 계산 가능한 공격기를 찾지 못했습니다.');const lines=damageScenarioResults(attacker,defender,set,best.move,D.master).map(({label,calc})=>{const r=calc.result;return `**${label}** — ${r.min}~${r.max} (${r.minPct}~${r.maxPct}%) · ${r.label}`});
  return reply(evidence+`**${attacker.name} → ${defender.name} 결정력 비교**\n선택 기술: **${best.move[0]}** · 채용률 ${best.rate}% · ${best.calc.type}/${best.calc.category} · 위력 ${best.move[4]}\n자속 ×${best.calc.stab} · 타입상성 ×${best.calc.typeMultiplier}\n공격 세팅: ${set.items||'도구 없음'} / ${set.abilities||'특성 없음'} / ${set.natures||'성격 없음'} / ${evText(set.evs)}\n\n${lines.join('\n')}\n\n채용률 상위 4개 기술 중 대상에게 최대 피해를 주는 공격기를 사용합니다. 방어 성격은 무보정이며 86~100의 15난수 기준입니다. 조건부 효과·연속기 횟수·가변 위력 등은 제외합니다.`);
 }
 if(it.data.name==='스피드계산기'){
  const attacker=rows.find(p=>p.name===opt['공격포켓몬']),defender=rows.find(p=>p.name===opt['방어포켓몬']);if(!attacker||!defender)return reply('비교할 두 포켓몬을 자동완성 후보에서 선택해 주세요.');const left=speedVariants(attacker,D.master),right=speedVariants(defender,D.master);if(!left||!right)return reply('현재 챔피언스 데이터로 스피드를 계산할 수 없습니다.');const lines=left.map((a,i)=>{const b=right[i],mark=a.value===b.value?'＝':a.value>b.value?'＞':'＜',winner=a.value===b.value?'동속':a.value>b.value?attacker.name:defender.name;return `**${a.label}** — ${attacker.name} ${a.value} ${mark} ${b.value} ${defender.name} · ${winner}`});return reply(evidence+`**${attacker.name} ↔ ${defender.name} 스피드 비교**\n${lines.join('\n')}\n\n최속은 S32+스피드 상승 성격, 준속은 S32 무보정 성격, 무보정은 S0 기준입니다. 스카프는 해당 수치에 ×1.5 후 버림합니다.`);
 }
 if(it.data.name==='스크린샷')return reply('스크린샷은 웹앱의 「스크린샷 입력」에서 인식 결과를 확인한 후 적용하세요. 디스코드 첨부 자동 인식은 아직 지원하지 않습니다.\n'+(process.env.APP_URL||'웹앱 주소가 아직 설정되지 않았습니다.'));
 return reply('지원 명령: /메타, /샘플, /추천, /파티, /결정력계산기, /스피드계산기, /계산기, /웹앱, /스크린샷, /명령어');
}
