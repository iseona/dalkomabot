import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'),{chromium}=createRequire(import.meta.url)('playwright');
const audit=JSON.parse(await readFile(path.join(root,'reports/cloud-lead-candidates.json'))),manifest=JSON.parse(await readFile(path.join(root,'tests/fixtures/recognition/manifest.json')));
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true}),reports=[];
try{for(const screen of audit.screens){const page=await browser.newPage({viewport:{width:1400,height:1000}}),endpoint='https://recognition.invalid/';let calls=0;
await page.addInitScript(endpoint=>{window.DALKOMA_CONFIG={recognitionEndpoint:endpoint};},endpoint);
await page.route(endpoint,async route=>{calls++;const sent=route.request().postDataJSON();assert.deepEqual(sent.images.map(image=>createHash('sha256').update(Buffer.from(image.split(',')[1],'base64')).digest('hex')),screen.inputHashes);
await route.fulfill({json:{schemaVersion:1,kind:'lead',slots:[],sides:Object.fromEntries(['mine','opp'].map((side,s)=>[side,screen[side].map((name,i)=>({slot:i+1,name,item:null,ability:null,nature:null,moves:[],evs:Array(6).fill(null),confidence:screen.confidence[s*6+i],notes:''}))]))}});});
await page.goto(process.env.RECOGNITION_SITE||`http://127.0.0.1:${server.address().port}/dist/index.html`);await page.locator('[data-tab="lead"]').click();await page.locator('#leadFile').setInputFiles(path.join(root,'tests/fixtures/recognition',screen.file));await page.waitForFunction(()=>!document.querySelector('#leadAI').disabled);assert.equal(calls,0);
await page.locator('#leadAI').click();await page.waitForFunction(()=>!document.querySelector('#leadAI').disabled,{},{timeout:45000});console.log('Lead status:',await page.locator('#leadStatus').innerText());
const actual=await page.evaluate(()=>Object.fromEntries(['mine','opp'].map(side=>[side,Array.from(document.querySelectorAll(`[data-leadsearch="${side}"]`)).map(input=>({name:input.value,candidates:Array.from(input.closest('article').querySelectorAll('[data-leadname]')).map(b=>b.dataset.leadname)}))])));
const checks=['mine','opp'].flatMap(side=>actual[side].map((slot,i)=>({side,slot:i+1,expected:manifest.lead[screen.file][side][i],...slot})));
const failures=checks.filter(c=>c.name?c.name!==c.expected:!c.candidates.includes(c.expected));
reports.push({file:screen.file,calls,checks,confirmed:checks.filter(c=>c.name).length,review:checks.filter(c=>!c.name).length,failures});
for(const [side,id]of [['mine','leadMine'],['opp','leadOpponent']])await page.locator('#'+id).screenshot({path:path.join(root,'reports',screen.file+'-'+side+'-page.png')});
console.log(JSON.stringify(reports.at(-1)));await page.close();}
await writeFile(path.join(root,process.env.RECOGNITION_SITE?'reports/published-lead-candidate-page.json':'reports/lead-candidate-page.json'),JSON.stringify(reports,null,2));assert(reports.every(r=>r.failures.length===0),'No wrong confirmed name; every unresolved slot must retain the correct candidate');
}finally{await browser.close();server.close();}
