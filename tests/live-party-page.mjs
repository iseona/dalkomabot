// Explicit opt-in only: this test calls the real configured recognition API.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const replay=process.argv.includes('--replay');
const candidate=process.argv.includes('--candidate');
const localOnly=process.argv.includes('--local');
const cross=process.argv.includes('--cross'),prefix=process.argv.includes('--wide')?'wide-':cross?'cross-':'';
if(!localOnly&&!replay&&!candidate&&(!process.argv.includes('--live')||!process.env.RECOGNITION_ENDPOINT))throw Error('Requires --local, --live and RECOGNITION_ENDPOINT, --candidate, or --replay');
const endpoint=process.env.RECOGNITION_ENDPOINT||'https://recognition.invalid/';
const {chromium}=createRequire(import.meta.url)('playwright'),root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();const ext=path.extname(file);res.setHeader('content-type',['.mjs','.js'].includes(ext)?'text/javascript':ext==='.css'?'text/css':ext==='.html'?'text/html':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});let calls=0,serverResult=null;
 await page.addInitScript(endpoint=>{window.DALKOMA_CONFIG={recognitionEndpoint:endpoint};},endpoint);
 if(localOnly)await page.route('**/*',route=>{if(route.request().method()==='POST'){calls++;return route.abort('failed');}return route.continue();});
 if(replay){const saved=JSON.parse(await readFile(path.join(root,'reports/live-party-page.json'))).serverResult;await page.route(endpoint,route=>route.fulfill({json:saved}));}
 if(candidate){const audit=JSON.parse(await readFile(path.join(root,'reports',cross?'cloud-cross-candidate.json':'cloud-candidate-v3.json'))),saved=audit.result;await page.route(endpoint,async route=>{
  const sent=route.request().postDataJSON();
  if(audit.inputHashes)assert.deepEqual(sent.images.map(image=>createHash('sha256').update(Buffer.from(image.split(',')[1],'base64')).digest('hex')),audit.inputHashes,'Generated pixels changed since actual API validation; require fresh actual inference');
  for(const [i,file] of ['party-contact-corrected.jpg','party-text.jpg','party-portraits.jpg'].entries())assert.deepEqual(Buffer.from(sent.images[i].split(',')[1],'base64'),await readFile(path.join(root,'reports',prefix+file)),'Page must produce the identical images used by the actual CloudShell API test');
  await route.fulfill({json:saved});
 });}
 page.on('request',r=>{if(r.url()===endpoint&&r.method()==='POST')calls++;});
 page.on('response',async r=>{if(r.url()===endpoint&&r.request().method()==='POST')try{serverResult=await r.json();}catch{}});
 await page.goto(process.env.RECOGNITION_SITE||`http://127.0.0.1:${server.address().port}/dist/index.html`);
 await page.locator('[data-tab="import"]').click();
 let inputFiles=['ability','stats'].map(type=>path.join(root,'tests/fixtures/recognition',`${prefix}party-${type}.${prefix==='wide-'?'png':'jpg'}`));
 if(process.argv.includes('--720p')||process.argv.includes('--transform')){
  const sources=await Promise.all(inputFiles.map(async file=>'data:image/'+(file.endsWith('.png')?'png':'jpeg')+';base64,'+(await readFile(file)).toString('base64')));
  const images=await page.evaluate(async({sources,translated})=>Promise.all(sources.map(async source=>{
   const b=await createImageBitmap(await(await fetch(source)).blob()),c=document.createElement('canvas'),scale=translated?.73:1280/b.width,left=translated?173:0,top=translated?287:0;
   const width=Math.round(b.width*scale),height=Math.round(b.height*scale);
   c.width=width+left+(translated?93:0);c.height=height+top+(translated?81:0);
   const ctx=c.getContext('2d');ctx.fillStyle='#151515';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(b,left,top,width,height);b.close();return c.toDataURL('image/jpeg',.85);
  })),{sources,translated:process.argv.includes('--transform')});
  inputFiles=images.map((url,i)=>({name:`source-${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(url.split(',')[1],'base64')}));
 }
 await page.locator('#imageFile').setInputFiles(inputFiles);
 try{await page.waitForFunction(()=>!document.querySelector('#ocrBtn').disabled&&document.querySelector('#ocrStatus').textContent.includes('인식 완료'),{},{timeout:180000});}
 catch(error){console.error('Recognition status:',await page.locator('#ocrStatus').textContent());throw error;}
 const actual=await page.evaluate(()=>Array.from({length:6},(_,i)=>({
  name:document.querySelector(`[data-ocrquery="${i}"]`).value,
  item:document.querySelector(`#ocr-${i}-items`)?.value||'',ability:document.querySelector(`#ocr-${i}-abilities`)?.value||'',nature:document.querySelector(`#ocr-${i}-natures`)?.value||'',
  moves:Array.from({length:4},(_,j)=>document.querySelector(`#ocr-${i}-move-${j}`)?.value||''),
  evs:Array.from({length:6},(_,j)=>{const value=document.querySelector(`[data-ocrslot="${i}"][data-ocrstat="${j}"]`).value;return value===''?null:Number(value);}),
 })));
 const expected=prefix?JSON.parse(await readFile(path.join(root,`tests/fixtures/recognition/${prefix}party-expected.json`))):{...JSON.parse(await readFile(path.join(root,'tests/fixtures/recognition/manifest.json'))).party,natures:['명랑','겁쟁이','명랑','고집','겁쟁이','고집']};
 const checks=[];
 for(let i=0;i<6;i++){
  checks.push({slot:i+1,field:'nature',expected:expected.natures[i],actual:actual[i].nature,pass:expected.natures[i]===actual[i].nature});
  for(const field of ['name','item','ability']){const value=field==='name'?expected.names[i]:expected.details[i][field];checks.push({slot:i+1,field,expected:value,actual:actual[i][field],pass:value===actual[i][field]});}
  for(let j=0;j<4;j++)checks.push({slot:i+1,field:`move${j+1}`,expected:expected.details[i].moves[j],actual:actual[i].moves[j],pass:expected.details[i].moves[j]===actual[i].moves[j]});
  for(let j=0;j<6;j++)checks.push({slot:i+1,field:`EV${j+1}`,expected:expected.evs[i][j],actual:actual[i].evs[j],pass:expected.evs[i][j]===actual[i].evs[j]});
 }
 const report={replay,candidate,calls,actual,serverResult,checks,passed:checks.filter(c=>c.pass).length,total:checks.length};
 const reportName=(process.env.RECOGNITION_SITE?'published-':'')+prefix+(localOnly?'local-party-page':candidate?'candidate-party-page':replay?'replayed-party-page':'live-party-page')+(process.argv.includes('--720p')?'-720p':'')+(process.argv.includes('--transform')?'-translated':'');
 await writeFile(path.join(root,'reports',reportName+'.json'),JSON.stringify(report,null,2)+'\n');
 await page.locator('#ocrResults').screenshot({path:path.join(root,'reports',reportName+'.png')});
 for(let i=0;i<6;i++)await page.locator('#ocrResults .ocrrow').nth(i).screenshot({path:path.join(root,'reports',`${reportName}-slot-${i+1}.png`)});
 console.log(JSON.stringify({calls,passed:report.passed,total:report.total,failures:checks.filter(c=>!c.pass)}));
 if(replay){
  for(const i of [1,2,3]){assert.equal(actual[i].name,'');assert.deepEqual(actual[i].moves,serverResult.slots[i].moves);assert.deepEqual(actual[i].evs,serverResult.slots[i].evs);assert.equal(actual[i].item,serverResult.slots[i].item);}
  console.log('PASS: saved server text survives species disagreement in the actual page. Replay is NOT new recognition accuracy validation.');
 }else{assert.equal(calls,localOnly?0:1);assert(checks.every(c=>c.pass),'Actual page values must match every manually audited field');}
}catch(error){console.error(error.message);throw error;}finally{await browser.close();server.close();}
