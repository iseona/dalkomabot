import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {generateKeyPairSync,sign} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {draft,makeSet,validSet,validEV,recommend,empiricalCoverage,calculateStats,damageRolls,classifyKO,battleCalculation,strongestStatMove,damageScenarioResults,speedVariants} from '../dist/engine.mjs';
import {parseStats,selectStatValues,validVisualFeature,rankVisualCandidates,confidentVisual} from '../dist/recognition.mjs';
import {escapeHtml} from '../dist/ui.mjs';
const root=path.resolve(import.meta.dirname,'..'),D=JSON.parse(fs.readFileSync(root+'/dist/data.json')),O=JSON.parse(fs.readFileSync(root+'/dist/opendata.json'));
const sprites=JSON.parse(fs.readFileSync(root+'/dist/sprite-map.json'));
const currentPokemon=new Set(Object.values(D.modes).flatMap(rows=>rows.map(p=>p.name)));
assert.equal(currentPokemon.size,235);assert.equal(Object.keys(sprites).length,235);
for(const name of currentPokemon){assert(sprites[name]);const file=root+'/dist/'+sprites[name];assert(fs.statSync(file).size>100);assert.equal(fs.readFileSync(file).subarray(1,4).toString(),'PNG')}
for(const mode of ['single','double']){
 const rows=D.modes[mode],open=O.modes[mode];assert.equal(rows.length,235);assert.equal(new Set(rows.map(p=>p.name)).size,235);
 for(const p of rows){assert(D.master.pokemon.some(x=>x[0]===p.name));for(const k of ['items','moves','natures','abilities'])for(const v of p[k]){assert(D.master[k].some(x=>x[0]===v.name));assert(!/[ぁ-ヿ一-龯]/.test(v.name));assert(v.rate>=0&&v.rate<=100)}for(const e of p.evs)assert(validEV(e.name.match(/\d+/g).map(Number)));for(const c of p.counters){assert(D.master.pokemon.some(x=>x[0]===c.name));assert(c.rate>=0&&c.rate<=100);assert(Number.isInteger(c.n)&&c.n>0)}}
 for(const fixed of [[],['블래키'],['한카리아스','따라큐']]){let team=draft(rows,open,fixed,D.master);assert.equal(team.length,6);assert(team.every(s=>validSet(s,rows)));assert.equal(new Set(team.map(s=>s.name)).size,6);assert.equal(new Set(team.filter(s=>s.items).map(s=>s.items)).size,team.filter(s=>s.items).length);assert(fixed.every(n=>team.some(s=>s.name===n)))}
 for(const f of open.frequency){const actual=open.teams.filter(t=>t.team.some(m=>m.name===f.name)).length;assert.equal(f.count,actual);assert.equal(f.rate,Math.round(actual/open.count*1000)/10)}
 for(const t of open.teams){assert.equal(t.team.length,6);for(const m of t.team){assert(D.master.pokemon.some(x=>x[0]===m.name));assert(!m.item||D.master.items.some(x=>x[0]===m.item));assert.deepEqual(Object.keys(m).sort(),['id','item','name'])}}
}
assert(!validEV([32,32,3,0,0,0]));assert(!validEV([33,0,0,0,0,0]));assert(!validEV([null,0,0,0,0,0]));
assert.deepEqual(calculateStats([72,120,98,50,98,72],[2,32,0,0,0,32],D.master.natures.find(x=>x[0]==='고집')),[149,189,118,63,118,124]);
assert.deepEqual(damageRolls(100,100,100,0),Array(15).fill(0));assert.equal(classifyKO(damageRolls(100,100,100,0),100).label,'효과 없음');assert.equal(classifyKO(damageRolls(100,100,100,1),40).label,'난수 1타 93%');assert.equal(classifyKO(damageRolls(100,100,100,1),47).label,'확정 2타');
{const a=D.modes.single.find(x=>x.name==='달코퀸'),d=D.modes.single.find(x=>x.name==='한카리아스'),s=makeSet(a),m=D.master.moves.find(x=>x[0]==='트리플악셀'),c=battleCalculation(a,d,s,m,[0,0,0,0,0,0],D.master);assert(c);assert.equal(c.type,'얼음');assert.equal(c.typeMultiplier,4);assert.equal(c.stab,1);assert.equal(c.result.label,'난수 3타 15%');assert(c.powerIndex>0)}
{const a=D.modes.single.find(x=>x.name==='달코퀸'),d=D.modes.single.find(x=>x.name==='한카리아스'),s=makeSet(a),best=strongestStatMove(a,d,s,D.master),scenarios=damageScenarioResults(a,d,s,best.move,D.master),speeds=speedVariants(a,D.master);assert.equal(best.move[0],'무릎차기');assert.equal(scenarios.length,7);assert.deepEqual(scenarios.map(x=>x.label),['H0 B0','H32 B0','H32 B32','H0 B32','H32 D0','H32 D32','H0 D32']);assert.equal(speeds.length,6);assert(speeds[0].value>speeds[1].value);assert.equal(speeds[3].value,Math.floor(speeds[0].value*1.5))}
{const p=D.modes.single.find(x=>x.name==='달코퀸'),custom={...draft(D.modes.single,O.modes.single,['달코퀸'],D.master)[0],moves:['10만마력']};assert(!validSet(custom,D.modes.single));assert(validSet(custom,D.modes.single,D.master));assert(p.moves.every(x=>x.name!=='10만마력'))}
let code=fs.readFileSync(root+'/dist/app.js','utf8').replace(/\r\n/g,'\n'),recognitionCode=fs.readFileSync(root+'/dist/recognition.mjs','utf8'),uiTemplatesCode=fs.readFileSync(root+'/dist/ui-templates.mjs','utf8'),calculatorCode=fs.readFileSync(root+'/dist/calculator.mjs','utf8');
assert.equal(escapeHtml('<b>"달콤" & 봇</b>'),'&lt;b&gt;&quot;달콤&quot; &amp; 봇&lt;/b&gt;');
assert(code.includes('ratio<1.55||ratio>2.7'));
const feature={area:.2,...Object.fromEntries(Object.entries({hue:12,sv:16,shape:16,geom:4,rgb:3,fine:64}).map(([key,n])=>[key,Array(n).fill(1/Math.sqrt(n))]))};
assert(validVisualFeature(feature));
for(const invalid of [null,{}, {...feature,area:0},{...feature,fine:[NaN]},{...feature,rgb:[1,2,3]}])assert(!validVisualFeature(invalid));
assert.deepEqual(rankVisualCandidates([], [{name:'test',feature}]),[]);
assert.deepEqual(rankVisualCandidates([feature], [{name:'test',feature:{}}]),[]);
assert.equal(rankVisualCandidates([feature], [{name:'test',feature}])[0].name,'test');
for(const scores of [[],[.1],[.1,.1],[.1,.11],[.3,.5],[NaN,.2],[.1,Infinity],[.2,.1]])assert(!confidentVisual(scores.map(score=>({score}))));
assert(confidentVisual([{score:.1},{score:.2}]));
assert(code.includes("monSprite(name,'detail')"));
assert(code.includes("T.createWorker('kor+eng'"));
assert(code.includes("document.querySelectorAll('dialog')"));
assert(code.includes("$('teammateRecommendations').innerHTML"));
const css=fs.readFileSync(root+'/dist/style.css','utf8');assert(css.includes('.monpic.missing{background:linear-gradient'));assert(css.includes('.monpic.detail{width:112px;height:112px'));
assert(css.includes('.ocrfallback{'));
assert.deepEqual(parseStats('HP 149 2 특수공격 63 0\n공격 189 32 특수방어 118 0\n방어 118 0 스피드 124 32'),[2,32,0,0,0,32]);assert.deepEqual(parseStats('HP 149 99'),[null,null,null,null,null,null]);
assert.deepEqual(parseStats('향 137 2 @ 특수공격4 161_ 32\n※ 공격* 63 0 특숭어 90 0\n열 방어 120 0 = 스피드 117-32'),[2,0,0,32,0,32]);
assert.deepEqual(selectStatValues('149 2 63 0\n189 32 118 0\n118 0 124 32','',validEV),[2,32,0,0,0,32]);assert.deepEqual(selectStatValues('bad','HP 149 2 특수공격 63 0\n공격 189 32 특수방어 118 0\n방어 118 0 스피드 124 32',validEV),[2,32,0,0,0,32]);
assert(code.includes("from './recognition.mjs'"));assert(code.includes("tessedit_char_whitelist:'0123456789 '"));assert(code.includes('selectStatValues(numberText,text,validEV)'));
assert(code.includes('data-detailbuild'));assert(code.includes('rankedChoices(p,k)'));assert(code.includes('performanceHtml(ts)'));
assert(code.includes('setOcrFiles(e.target.files)'));assert(code.includes("mainDrop.addEventListener('drop'"));assert(code.includes('data-imageremove'));assert(code.includes('imageViewer'));assert(code.includes('damageBenchmark(s,target,move,evs)'));
assert(uiTemplatesCode.includes('data-tab="lead"'));assert(code.includes("panelLayout(img,'mine')"));assert(code.includes("mode==='single'?3:4"));assert(code.includes('maxDamage(source,target'));
assert(code.includes('const regions='));assert(code.includes('uniqueVisualRankings'));
assert(uiTemplatesCode.includes('data-tab="calculators"'));assert(calculatorCode.includes('export function setupCalculator'));assert(calculatorCode.includes('function runPowerSweep()'));assert(calculatorCode.includes('function runSpeedCompare()'));assert(code.includes('data-leadmatches'));assert(!code.includes('레벨 50'));
assert(code.includes("fetch('sprite-home-map.json')"));assert(code.includes("fetch('sprite-home-shiny-map.json')"));assert(code.includes("fetch('recognition-db.json')"));assert(recognitionCode.includes('fineSilhouette'));assert(code.includes("features=crops.map(c=>visualFeature(c,false,side))"));assert(code.includes('ocrVisualCrops'));assert(code.includes('visualRankings=uniqueVisualRankings'));assert(code.includes('saveLearnedReferences'));
const recognition=JSON.parse(fs.readFileSync(root+'/dist/recognition-db.json')),officialRefs=recognition.references.filter(x=>x.source==='champs.pokedb.tokyo 공식 아이콘');assert.equal(recognition.schemaVersion,3);assert(officialRefs.length>=127);assert.equal(new Set(officialRefs.map(x=>x.name)).size,officialRefs.length);for(const name of ['워시로토무','히트로토무','한카리아스','따라큐','마폭시','핫삼','플라엣테(영원의 꽃)','왕큰부리','달코퀸','프테라','라이츄','포푸니크','님피아','대도각참'])assert(officialRefs.some(x=>x.name===name));assert(!recognition.references.some(x=>['PokeAPI 보조','현재 목록 기본 이미지'].includes(x.source)));for(const ref of recognition.references){assert(currentPokemon.has(ref.name));assert(fs.statSync(root+'/dist/'+ref.src).size>100)}
const html=fs.readFileSync(root+'/dist/index.html','utf8'),manifest=JSON.parse(fs.readFileSync(root+'/dist/manifest.webmanifest')),version=JSON.parse(fs.readFileSync(root+'/dist/version.json'));assert(html.includes('<title>포챔스 달콤아 봇</title>'));assert(html.includes('assets/dalkoma-logo-192.png'));assert(html.includes('dalkoma-favicon.png?v=16'));assert(html.includes('<strong class="appversion">v16</strong>'));assert(html.includes('id="imageFile" accept="image/png,image/jpeg,image/webp" multiple'));assert(!html.includes('id="screenType"'));assert.equal(manifest.name,'포챔스 달콤아 봇');assert.equal(version.version,'v16');assert.equal(version.builtAt,'2026-09-09');assert.equal(version.name,'포챔스 달콤아 봇');for(const icon of ['dalkoma-favicon.png','dalkoma-apple-touch.png','dalkoma-logo-192.png','dalkoma-logo-512.png'])assert(fs.statSync(root+'/dist/assets/'+icon).size>100);assert(!code.includes("source:'PokeAPI 보조'"));
const deploy=fs.readFileSync(root+'/aws/deploy.py','utf8');assert(deploy.includes("'no-cache, no-store, must-revalidate'"));assert(deploy.includes("'invalidation-completed'"));assert(deploy.includes('CloudFront cache refresh completed.'));
for(const m of ['single','double']){const z=D.modes[m].find(x=>x.name==='리자몽');assert.equal(z.items[0].name,'리자몽나이트Y');assert.equal(z.items[1].name,'리자몽나이트X');assert(z.items[0].rate>z.items[1].rate)}
const spriteSync=fs.readFileSync(root+'/scripts/sync_pokeapi_sprites.py','utf8'),championsSync=fs.readFileSync(root+'/scripts/sync_champions_icons.py','utf8');assert(spriteSync.includes('pokemon/shiny'));assert(spriteSync.includes('pokemon/other/home/shiny'));assert(spriteSync.includes('sprite-home-map.json'));assert(!spriteSync.includes('RECOGNITION_DB'));assert(championsSync.includes('champs.pokedb.tokyo'));assert(championsSync.includes('SUPPLEMENTAL'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'champ-bot-test-'));
try{
 for(const [src,name] of [['discord/handler.mjs','handler.mjs'],['dist/engine.mjs','engine.mjs'],['dist/types.mjs','types.mjs'],['dist/data.json','data.json'],['dist/opendata.json','opendata.json']])fs.copyFileSync(root+'/'+src,temp+'/'+name);
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');process.env.DISCORD_PUBLIC_KEY=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');delete process.env.APP_URL;
 const {handler}=await import(pathToFileURL(temp+'/handler.mjs'));
 const event=(value)=>{const body=JSON.stringify(value),ts=String(Math.floor(Date.now()/1000));return {body,headers:{'x-signature-timestamp':ts,'x-signature-ed25519':sign(null,Buffer.from(ts+body),privateKey).toString('hex')}}};
 assert.equal((await handler({body:'{}',headers:{}})).statusCode,401);
 assert.equal(JSON.parse((await handler(event({type:1}))).body).type,1);
 for(const name of ['메타','추천','파티','웹앱','스크린샷']){const res=await handler(event({type:2,data:{name,options:[]}}));assert.equal(res.statusCode,200);const data=JSON.parse(res.body).data;assert.equal(data.flags,64);assert(data.content.length<=2000);assert(data.content.length>30)}
 const calculator=JSON.parse((await handler(event({type:2,data:{name:'계산기',options:[{name:'공격포켓몬',value:'달코퀸'},{name:'방어포켓몬',value:'한카리아스'},{name:'기술',value:'트리플악셀'},{name:'방어배분',value:'zero'}]}}))).body).data;assert.equal(calculator.flags,64);assert(calculator.content.includes('난수'));assert(calculator.content.includes('타입상성 ×4'));assert(calculator.content.includes('결정력 지수'));
 const power=JSON.parse((await handler(event({type:2,data:{name:'결정력계산기',options:[{name:'공격포켓몬',value:'달코퀸'},{name:'방어포켓몬',value:'한카리아스'}]}}))).body).data;assert.equal(power.flags,64);assert(power.content.includes('H0 B0'));assert(power.content.includes('H32 D32'));assert(power.content.includes('채용률 상위 4개 기술'));
 const speed=JSON.parse((await handler(event({type:2,data:{name:'스피드계산기',options:[{name:'공격포켓몬',value:'달코퀸'},{name:'방어포켓몬',value:'한카리아스'}]}}))).body).data;assert.equal(speed.flags,64);assert(speed.content.includes('최속'));assert(speed.content.includes('스카프 무보정'));
 const moveChoices=JSON.parse((await handler(event({type:4,data:{name:'계산기',options:[{name:'공격포켓몬',value:'달코퀸'},{name:'기술',value:'트리',focused:true}]}}))).body);assert.equal(moveChoices.type,8);assert.equal(moveChoices.data.choices[0].value,'트리플악셀');
 const sample=JSON.parse((await handler(event({type:2,data:{name:'샘플',options:[{name:'포켓몬',value:'블래키'}]}}))).body).data;assert.equal(sample.flags,64);assert(sample.content.includes('종족값:'));assert(sample.content.includes('기술:'));
 const autocomplete=JSON.parse((await handler(event({type:4,data:{name:'샘플',options:[{name:'포켓몬',value:'프레프티르',focused:true}]}}))).body);assert.equal(autocomplete.type,8);assert.equal(autocomplete.data.choices[0].value,'프레프티르');assert(autocomplete.data.choices[0].name.includes('235위'));
 const help=JSON.parse((await handler(event({type:2,data:{name:'명령어',options:[]}}))).body).data;assert.equal(help.flags,undefined);assert(help.content.includes('/웹앱'));assert(help.content.includes('/결정력계산기'));assert(help.content.includes('/스피드계산기'));assert(help.content.includes('/계산기'));assert(help.content.includes('/명령어'));
 const bad=event({type:1});bad.body='{"type":2}';assert.equal((await handler(bad)).statusCode,401);
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log('PASS: 470 records; 254 public teams; whitelist, frequency denominators, shared drafts, EV bounds, OCR numeric parsing, Discord signatures and ten commands with autocomplete.');
const {multiplier,assessCandidate,matchup}=await import('../dist/engine.mjs');
assert.equal(multiplier('얼음',['드래곤','땅']),4);
assert.equal(multiplier('땅',['비행','강철']),0);
const single=D.modes.single,get=n=>single.find(p=>p.name===n);
const empirical=empiricalCoverage(get('브리두라스'),single,O.modes.single,['한카리아스']);assert(empirical.covered.some(x=>x.name==='배바닐라'));assert(empirical.score>0);
const double=D.modes.double;const mate=recommend(double,O.modes.double,['달코퀸'],D.master).find(x=>x.p.name==='한카리아스');assert.equal(mate.teammateEvidence[0].direct,1);
const better=assessCandidate(get('메타그로스'),single,O.modes.single,['한카리아스'],D.master);
const worse=assessCandidate(get('하마돈'),single,O.modes.single,['한카리아스'],D.master);
assert(better.defense>worse.defense);
assert(better.repaired.some(x=>x.type==='얼음'));
assert.equal(matchup(get('누리레느'),get('한카리아스'),D.master,{moves:['명상']}).usable,false);
assert.equal(matchup(get('누리레느'),get('한카리아스'),D.master,{moves:['문포스']}).usable,true);
for(const file of ['tesseract.min.js','worker.min.js','tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js'])assert(fs.statSync(root+'/dist/vendor/ocr/'+file).size>100);
for(const lang of ['kor','eng']){const gz=fs.readFileSync(root+'/dist/vendor/ocr/'+lang+'.traineddata.gz');assert.equal(gz.readUInt16BE(0),0x1f8b)}
console.log('PASS: type priority, actual selected moves, OCR local runtime asset integrity.');

for(const f of ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js'])assert(fs.readFileSync(root+'/dist/vendor/ocr/'+f,'utf8').includes('AGFzbQE'));
