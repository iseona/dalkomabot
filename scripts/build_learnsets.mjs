import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pokemon = JSON.parse(await fs.readFile(new URL('dist/data.json', root), 'utf8')).master.pokemon;
const source = 'https://pokemon.yodams.com/dex/pokemon';
const headers = {'user-agent': 'Googlebot'};
const decode = value => String(value).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
const slug = value => String(value).toLowerCase().replace(/♀/g,'-f').replace(/♂/g,'-m').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const koreanKey = value => String(value).replace(/\s+/g,'').replace(/페더/g,'깃털').replace(/의모습|모습/g,'').replace(/[()]/g,'');
function englishCandidates(value) {
  const plain = String(value), base = slug(plain.split('(')[0]), inner = plain.match(/\(([^)]+)\)/)?.[1] || '';
  const out = new Set([slug(plain), base]);
  if (/Mega/i.test(inner)) {
    const suffix = inner.match(/Mega(?:\s+[^\s]+)*\s+([XYZ])$/i)?.[1]?.toLowerCase();
    out.add(`${base}-mega${suffix?'-'+suffix:''}`);
  }
  for (const [word, form] of [['Alola','alola'],['Alolan','alola'],['Galar','galar'],['Galarian','galar'],['Hisui','hisui'],['Hisuian','hisui'],['Paldea','paldea'],['Paldean','paldea']]) if (plain.includes(word)) out.add(`${base}-${form}`);
  return [...out];
}

const index = await (await fetch(source, {headers})).text(), links = [];
for (const match of index.matchAll(/<a[^>]+href="(\/dex\/pokemon\/([^"?#/]+)\/?)"[^>]*>([\s\S]*?)<\/a>/g)) links.push({url:new URL(match[1],source).href,slug:match[2],name:decode(match[3])});
const byName = new Map(links.map(item=>[koreanKey(item.name),item])), bySlug = new Map(links.map(item=>[item.slug,item])),representatives={시비꼬:'squawkabilly',스트린더:'toxtricity'};
const details = {}, failures = [], queue = pokemon.map(row=>({row,item:byName.get(koreanKey(row[0]))||bySlug.get(representatives[row[0]])||englishCandidates(row[1]).map(key=>bySlug.get(key)).find(Boolean)}));
let cursor = 0;
async function worker(){while(cursor<queue.length){const {row,item}=queue[cursor++],name=row[0];if(!item){failures.push({name,reason:'detail-link-missing'});continue}try{const response=await fetch(item.url,{headers});if(!response.ok)throw Error(`HTTP ${response.status}`);const html=await response.text(),section=html.match(/<h2>배울 수 있는 기술<\/h2>([\s\S]*?)(?=<h2>|<section|$)/)?.[1]||'',moves=[...section.matchAll(/<a[^>]+href="\/dex\/move\/[^"?#]+\/?"[^>]*>([\s\S]*?)<\/a>/g)].map(match=>decode(match[1])).filter(Boolean);details[name]={moves:[...new Set(moves)],url:item.url}}catch(error){failures.push({name,reason:String(error.message||error)})}}}
await Promise.all(Array.from({length:8},worker));
const output={source,builtAt:new Date().toISOString(),total:pokemon.length,count:Object.keys(details).length,failures,details};
await fs.writeFile(new URL('dist/learnsets.json',root),JSON.stringify(output,null,2)+'\n');
console.log(`wrote ${output.count}/${output.total}; failures=${failures.length}; empty=${Object.values(details).filter(x=>!x.moves.length).length}`);
