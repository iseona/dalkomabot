// Explicit local operation. Never store the bot token in source or logs.
import {commandPayload} from './commands.mjs';
const {DISCORD_APPLICATION_ID:app,DISCORD_BOT_TOKEN:token,DISCORD_GUILD_ID:guild}=process.env;
if(!app||!token)throw Error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in the local environment.');
const guilds=(process.env.DISCORD_GUILD_IDS||guild||'').split(',').map(x=>x.trim()).filter(Boolean);
const targets=guilds.length?guilds:[null];
for(const target of targets){
 const url=`https://discord.com/api/v10/applications/${app}${target?'/guilds/'+target:''}/commands`;
 let response;
 for(let attempt=0;attempt<3;attempt++){
  response=await fetch(url,{method:'PUT',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify(commandPayload)});
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
