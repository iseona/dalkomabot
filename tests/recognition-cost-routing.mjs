import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<html></html>');return;}
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,pathname==='/pokemon-icon-legend.jpg'?'dist/pokemon-icon-legend.jpg':'.'+pathname);
    if(!file.startsWith(root+path.sep))throw Error('outside root');
    res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.json')?'application/json':'image/jpeg');
    res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async()=>{
    const {recognizeImages}=await import('/dist/ai-recognition.mjs');
    const {detectedLeadRects,loadScreenIconReferences,recognizeFixedLayout}=await import('/dist/local-image-recognition.mjs');
    const {localLeadResult}=await import('/dist/recognition-merge.mjs');
    const blob=await(await fetch('/tests/fixtures/recognition/lead-alolan-ninetales.webp')).blob();
    const file=new File([blob],'lead.webp',{type:'image/webp'});
    const names=['한카리아스','히트로토무','마스카나','리자몽','알로라 나인테일','메타그로스'];
    const slots=names.map((name,index)=>({slot:index+1,name,item:null,ability:null,nature:null,moves:[],evs:Array(6).fill(null),confidence:.9,notes:''}));
    const response={schemaVersion:1,kind:'lead',sides:{mine:slots,opp:slots}};
    let calls=0;
    const fetchImpl=async(url,options)=>{
      calls++;
      const body=JSON.parse(options.body);
      if(body.images.length!==2)throw Error('expected one contact sheet plus reference legend');
      const image=new Image();image.src=body.images[0];await image.decode();
      if(image.width!==1440||image.height!==1800)throw Error('invalid contact sheet');
      return {ok:true,json:async()=>structuredClone(response)};
    };
    // The only inference transport is a stub; no paid requests leave this test.
    const options={files:[file],mode:'single',kind:'lead',endpoint:'/mock',leadRectDetector:detectedLeadRects,fetchImpl};
    const first=await recognizeImages(options);
    first.sides.mine[0].name='mutated';
    const replay=await recognizeImages(options);
    if(replay.sides.mine[0].name!=='한카리아스'||calls!==1)throw Error('cache failed');
    const alternate={...options,mode:'double'};
    await Promise.all([recognizeImages(alternate),recognizeImages(alternate)]);
    if(calls!==2)throw Error('in-flight requests not deduplicated');
    const refs=await loadScreenIconReferences((await(await fetch('/dist/recognition-screen-map.json')).json()).map(entry=>({...entry,src:'/dist/'+entry.src})));
    const source=new Image();source.src=URL.createObjectURL(file);await source.decode();
    const original=recognizeFixedLayout(source,'lead',refs);
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const context=canvas.getContext('2d');context.drawImage(source,0,0);
    const rect=detectedLeadRects(source,'mine')[4];
    context.fillStyle='#777';context.fillRect(rect.x,rect.y,rect.width,rect.height);
    const modified=recognizeFixedLayout(canvas,'lead',refs);
    if(modified.sides.mine[4].name)throw Error('erased slot inferred from remembered background');
    const bypass=localLeadResult(original,()=>true);
    URL.revokeObjectURL(source.src);
    return {requests:calls,erasedSlot:modified.sides.mine[4].name,localBypass:Boolean(bypass)};
  });
  assert.equal(report.requests,2);
  assert.equal(report.erasedSlot,'');
  console.log('PASS: real image contact sheet, exact-file cache, in-flight deduplication and erased-slot rejection.',report);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
