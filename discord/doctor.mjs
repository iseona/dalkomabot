import {commandPayload} from './commands.mjs';

const {DISCORD_APPLICATION_ID:app,DISCORD_BOT_TOKEN:token,DISCORD_GUILD_ID:guild}=process.env;
const guilds=(process.env.DISCORD_GUILD_IDS||guild||'').split(',').map(value=>value.trim()).filter(Boolean);
const fail=message=>{console.error('FAIL: '+message);process.exitCode=1};
const ok=message=>console.log('OK: '+message);

if(!app||!/^\d{17,20}$/.test(app))fail('DISCORD_APPLICATION_ID가 없거나 올바른 숫자 ID가 아닙니다.');
if(!token)fail('DISCORD_BOT_TOKEN이 설정되지 않았습니다.');
if(guilds.some(value=>!/^\d{17,20}$/.test(value)))fail('DISCORD_GUILD_ID(S)에 올바르지 않은 서버 ID가 있습니다.');

if(!process.exitCode){
 const headers={Authorization:'Bot '+token};
 const application=await fetch('https://discord.com/api/v10/oauth2/applications/@me',{headers});
 if(!application.ok)fail(`봇 인증 실패: Discord HTTP ${application.status}`);
 else{
  const info=await application.json();
  if(info.id!==app)fail('토큰의 Application ID와 DISCORD_APPLICATION_ID가 서로 다릅니다.');
  else ok(`Discord 애플리케이션 ${info.name||info.id} 인증`);
 }
 for(const target of guilds.length?guilds:[null]){
  const scope=target?`서버 ${target}`:'전역';
  const url=`https://discord.com/api/v10/applications/${app}${target?'/guilds/'+target:''}/commands`;
  const response=await fetch(url,{headers});
  if(!response.ok){fail(`${scope} 명령 조회 실패: Discord HTTP ${response.status}`);continue}
  const actual=await response.json(),expected=new Set(commandPayload.map(command=>command.name)),registered=new Set(actual.map(command=>command.name));
  const missing=[...expected].filter(name=>!registered.has(name)),extra=[...registered].filter(name=>!expected.has(name));
  if(missing.length||extra.length)fail(`${scope} 명령 불일치 (누락: ${missing.join(', ')||'없음'} / 추가: ${extra.join(', ')||'없음'})`);
  else ok(`${scope} 슬래시 명령 ${actual.length}개 등록`);
 }
}

if(process.env.DISCORD_ENDPOINT_URL){
 try{
  const response=await fetch(process.env.DISCORD_ENDPOINT_URL,{method:'POST',headers:{'content-type':'application/json'},body:'{}',redirect:'error'});
  if(response.status===401)ok('Interaction Endpoint 도달 및 서명 거부 동작');
  else fail(`Interaction Endpoint가 예상한 401 대신 HTTP ${response.status} 응답`);
 }catch(error){fail(`Interaction Endpoint 연결 실패: ${error.message}`)}
}else console.log('SKIP: DISCORD_ENDPOINT_URL이 없어 엔드포인트 연결 검사를 생략합니다.');
