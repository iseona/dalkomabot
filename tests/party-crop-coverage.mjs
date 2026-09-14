import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'..');
const cross=process.argv.includes('--cross'),prefix=cross?'cross-':'';
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':'text/html');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/dist/index.html`);
 const result=await page.evaluate(async({prefix})=>{
  const {buildPartyContactSheet,detectedPartyCardRects,buildPartyCandidateLegend,readPartyNatureArrows,buildPartyTextSheet,buildPartyPortraitSheet}=await import('/dist/recognition-contact-sheet.mjs');
  const files=await Promise.all(['party-ability.jpg','party-stats.jpg'].map(async name=>new File([await(await fetch('/tests/fixtures/recognition/'+prefix+name)).blob()],name,{type:'image/jpeg'})));
  const sheet=await buildPartyContactSheet(files);sheet.portraits=await buildPartyPortraitSheet(files[0]);
  const arrows=[];for(const file of files){const bitmap=await createImageBitmap(file);arrows.push(readPartyNatureArrows(bitmap));bitmap.close();}
  const scaled=[],scaledFiles=[];
  for(const file of files){const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;canvas.getContext('2d').drawImage(bitmap,0,0,1280,720);scaled.push(detectedPartyCardRects(canvas));scaledFiles.push(new File([await new Promise(r=>canvas.toBlob(r,'image/jpeg',.85))],file.name,{type:'image/jpeg'}));bitmap.close();}
  const scaledSheet=await buildPartyContactSheet(scaledFiles);
  const scaledArrows=[];for(const file of scaledFiles){const bitmap=await createImageBitmap(file);scaledArrows.push(readPartyNatureArrows(bitmap));bitmap.close();}
  const {loadOfficialIconReferences,loadScreenIconReferences,recognizeFileLocally}=await import('/dist/local-image-recognition.mjs');
  const iconMap=await(await fetch('/dist/champions-icon-map.json')).json(),screenMap=await(await fetch('/dist/recognition-screen-map.json')).json();
  const refs=[...await loadOfficialIconReferences(Object.fromEntries(Object.entries(iconMap).map(([n,p])=>[n,'/dist/'+p]))),...await loadScreenIconReferences(screenMap.map(e=>({...e,src:'/dist/'+e.src})))];
  const local=await recognizeFileLocally(files[0],'party',refs);
  const legend=await buildPartyCandidateLegend(local.slots);
  return {...sheet,textSheet:await buildPartyTextSheet(files),scaledTextSheet:await buildPartyTextSheet(scaledFiles),arrows,scaledArrows,scaled,scaledDataUrl:scaledSheet.dataUrl,legend,candidates:local.slots.map(s=>({name:s.name,evidence:s.evidence,candidates:s.candidates}))};
 },{prefix});
 // Manually audited actual text bounds, not generated from the crop algorithm:
 assert.deepEqual(result.arrows[0],Array(6).fill(null),'Ability screen must not generate nature arrows');
 const expectedPairs=cross?['spa/atk','atk/spa','spe/spa','spa/atk','spe/atk','atk/spa']:['spe/spa','spe/atk','spe/spa','atk/spa','spe/atk','atk/spa'];
 assert.deepEqual(result.arrows[1].map(p=>p&&`${p.up}/${p.down}`),expectedPairs);
 assert.deepEqual(result.scaledArrows,result.arrows,'720p JPEG arrows must match original');
 // rows 1/2: y=.268-.418; rows 3/4: .471-.620; rows 5/6: .674-.821.
 for(const [rects,height]of [...result.sourceRects.map(r=>[r,1439]),...result.scaled.map(r=>[r,720])]){
  assert.equal(rects.length,6);
  for(let i=0;i<6;i++){const row=Math.floor(i/2);assert(rects[i].y/height<[.268,.471,.674][row]);assert((rects[i].y+rects[i].height)/height>[.418,.620,.821][row],`slot ${i+1} bottom text cut off`);}
 }
 await writeFile(path.join(root,'reports',prefix+'party-portraits.jpg'),Buffer.from(result.portraits.split(',')[1],'base64'));
 delete result.portraits;
 await writeFile(path.join(root,'reports',prefix+'party-contact-corrected.jpg'),Buffer.from(result.dataUrl.split(',')[1],'base64'));
 await writeFile(path.join(root,'reports',prefix+'party-candidate-legend.jpg'),Buffer.from(result.legend.split(',')[1],'base64'));
 await writeFile(path.join(root,'reports',prefix+'party-contact-720p.jpg'),Buffer.from(result.scaledDataUrl.split(',')[1],'base64'));
 await writeFile(path.join(root,'reports',prefix+'party-text.jpg'),Buffer.from(result.textSheet.split(',')[1],'base64'));
 await writeFile(path.join(root,'reports',prefix+'party-text-720p.jpg'),Buffer.from(result.scaledTextSheet.split(',')[1],'base64'));
 await writeFile(path.join(root,'reports',prefix+'party-crop-coverage.json'),JSON.stringify({...result,dataUrl:undefined,scaledDataUrl:undefined,legend:undefined,textSheet:undefined,scaledTextSheet:undefined},null,2)+'\n');
 console.log('PASS: both real screenshots at original and 720p size include all six cards through fourth move/bottom EV row.');
}finally{await browser.close();server.close();}
