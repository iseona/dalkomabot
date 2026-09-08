// Explicit local operation. Never store the bot token in source or logs.
const {DISCORD_APPLICATION_ID:app,DISCORD_BOT_TOKEN:token,DISCORD_GUILD_ID:guild}=process.env;
if(!app||!token)throw Error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in the local environment.');
const mode={type:3,name:'모드',description:'배틀 모드',required:false,choices:[{name:'싱글',value:'single'},{name:'더블',value:'double'}]};
const commands=[
 {name:'메타',description:'챔피언스 메타 또는 포켓몬 세팅 통계를 확인합니다.',options:[{type:3,name:'포켓몬',description:'공식 한글 이름 (생략하면 표본 내 순위)',required:false},mode]},
 {name:'샘플',description:'포켓몬의 최상위 통계 세팅을 확인합니다.',options:[{type:3,name:'포켓몬',description:'이름으로 검색하면 순위와 공개파티 채용률 표시',required:true,autocomplete:true},mode]},
 {name:'추천',description:'현재 멤버와 함께 쓸 후보를 찾습니다.',options:[{type:3,name:'포켓몬',description:'공식 한글 이름을 쉼표로 구분',required:false},mode]},
 {name:'파티',description:'고정 멤버를 포함해 여섯 마리 파티 초안을 만듭니다.',options:[{type:3,name:'포켓몬',description:'고정할 포켓몬 이름을 쉼표로 구분',required:false},mode]},
 {name:'웹앱',description:'포챔스 달콤아 봇 웹앱 주소를 확인합니다.'},
 {name:'스크린샷',description:'스크린샷을 인식하는 웹앱을 엽니다.'},
 {name:'계산기',description:'챔피언스 기준 데미지·결정력·내구력·스피드를 계산합니다.',options:[
  {type:3,name:'공격포켓몬',description:'공격하는 포켓몬',required:true,autocomplete:true},
  {type:3,name:'방어포켓몬',description:'공격받는 포켓몬',required:true,autocomplete:true},
  {type:3,name:'기술',description:'공격 포켓몬의 통계 등재 공격 기술',required:true,autocomplete:true},
  {type:3,name:'방어배분',description:'상대 포켓몬의 내구 투자 기준',required:false,choices:[{name:'H0 · B/D0',value:'zero'},{name:'H32 · B/D0',value:'hp'},{name:'H32 · B32',value:'physical'},{name:'H32 · D32',value:'special'}]},
  mode
 ]},
 {name:'결정력계산기',description:'두 포켓몬만 골라 최고 결정력 기술과 내구별 타수를 봅니다.',options:[
  {type:3,name:'공격포켓몬',description:'공격하는 포켓몬',required:true,autocomplete:true},
  {type:3,name:'방어포켓몬',description:'공격받는 포켓몬',required:true,autocomplete:true},
  mode
 ]},
 {name:'스피드계산기',description:'두 포켓몬의 최속·준속·무보정과 스카프 기준을 비교합니다.',options:[
  {type:3,name:'공격포켓몬',description:'첫 번째 포켓몬',required:true,autocomplete:true},
  {type:3,name:'방어포켓몬',description:'비교할 두 번째 포켓몬',required:true,autocomplete:true},
  mode
 ]},
 {name:'명령어',description:'포챔스 달콤아 봇 명령어 목록을 채널에 공개합니다.'}
];
const guilds=(process.env.DISCORD_GUILD_IDS||guild||'').split(',').map(x=>x.trim()).filter(Boolean);
const targets=guilds.length?guilds:[null];
for(const target of targets){
 const url=`https://discord.com/api/v10/applications/${app}${target?'/guilds/'+target:''}/commands`;
 let response;
 for(let attempt=0;attempt<3;attempt++){
  response=await fetch(url,{method:'PUT',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify(commands.map(command=>({...command,type:1})))});
  if(response.status!==429)break;
  const rate=await response.json().catch(()=>({}));
  const wait=Math.max(1000,Math.ceil(Number(rate.retry_after||2)*1000));
  console.log(`Discord rate limit: ${wait}ms 후 다시 시도합니다.`);
  await new Promise(resolve=>setTimeout(resolve,wait));
 }
 if(!response?.ok){const detail=await response?.text().catch(()=>'');throw Error(`Command registration failed (${target||'global'}): HTTP ${response?.status||'unknown'}${detail?' · '+detail.slice(0,300):''}`)}
 const registered=await response.json();
 console.log(`${target?`Server ${target}`:'Global'}: ${registered.map(command=>'/'+command.name).join(', ')}`);
}
