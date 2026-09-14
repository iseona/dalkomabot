import fs from 'node:fs/promises';

const root=new URL('../',import.meta.url),data=JSON.parse(await fs.readFile(new URL('dist/data.json',root),'utf8')),images=JSON.parse(await fs.readFile(new URL('dist/champions-image-map.json',root),'utf8'));
const abilityByEnglish=new Map(data.master.abilities.map(row=>[slug(row[1]),row[0]]));
const abilityDescription=new Map(data.master.abilities.map(row=>[row[0],row[2]]));
const abilityOverrides=new Map([
  [194,['위기회피','HP가 절반 이하가 되면 배틀에서 물러난다.']],
  [314,['하바네로분출','기술로 데미지를 입으면 상대를 화상 상태로 만든다.']],
  [315,['천정부지','땅타입 기술을 받지 않으며, 상대를 쓰러뜨리면 가장 높은 능력이 1랭크 오른다.']],
  [316,['불꽃의갈기','불꽃타입 기술의 위력이 1.5배가 된다.']]
]);
const abilityList=await fetch('https://pokeapi.co/api/v2/ability?limit=1000').then(r=>{if(!r.ok)throw Error(`PokeAPI abilities ${r.status}`);return r.json()});
const abilityById=new Map(abilityList.results.map(item=>[Number(item.url.match(/\/(\d+)\/$/)?.[1]),abilityByEnglish.get(slug(item.name))]).filter(([,name])=>name));
const entries=Object.entries(images).map(([name,path])=>[name,path.match(/pokemon-(\d{4}-\d{2})\.webp$/)?.[1]]).filter(([,id])=>id);
const details={},failures=[];

function slug(value){return String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function decode(value){return value.replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#039;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>')}
async function fetchOne([name,id]){
  try{
    const response=await fetch(`https://champs.pokedb.tokyo/pokemon/show/${id}?season=6&rule=0`,{headers:{'user-agent':'Dalkombot data snapshot/1.0'}});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const html=await response.text(),match=html.match(/pokemonShowBasis\((\{&quot;forms&quot;:.*?)\)"/s);
    if(!match)throw Error('basis payload not found');
    const payload=JSON.parse(decode(match[1])),form=payload.forms?.[id]||Object.values(payload.forms||{}).find(value=>value.pokemon_key===id);
    if(!form)throw Error('form not found');
    const resolved=(form.abilities||[]).map(value=>{const id=Number(value.ability_key),known=abilityById.get(id),override=abilityOverrides.get(id),ability=known||override?.[0];return ability?{name:ability,description:abilityDescription.get(ability)||override?.[1]||null}:null}).filter(Boolean);
    details[name]={sourceId:id,height:Number.isFinite(form.height)?form.height:null,weight:Number.isFinite(form.weight)?form.weight:null,abilities:resolved.map(value=>value.name),abilityDescriptions:Object.fromEntries(resolved.map(value=>[value.name,value.description])),sourceAbilities:(form.abilities||[]).map(value=>({id:Number(value.ability_key),name:value.name})),source:`https://champs.pokedb.tokyo/pokemon/show/${id}`};
  }catch(error){failures.push({name,id,error:error.message})}
}

for(let i=0;i<entries.length;i+=4){await Promise.all(entries.slice(i,i+4).map(fetchOne));if(i&&i%40===0)process.stdout.write(`collected ${i}/${entries.length}\n`)}
const output={schemaVersion:1,source:'https://champs.pokedb.tokyo',collectedAt:new Date().toISOString(),count:Object.keys(details).length,total:entries.length,details,failures};
await fs.writeFile(new URL('dist/pokedex-details.json',root),JSON.stringify(output,null,2)+'\n');
console.log(`wrote ${output.count}/${output.total}; failures=${failures.length}`);
