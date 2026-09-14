import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':'text/html');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/dist/index.html`);
 const report=await page.evaluate(async()=>{
  const {prepareIconTemplates,rankIconTemplates}=await import('/dist/icon-template-matcher.mjs');
  const {detectedLeadRects,cropRecognitionRect}=await import('/dist/local-image-recognition.mjs');
  const map=await(await fetch('/dist/champions-icon-map.json')).json(),manifest=await(await fetch('/tests/fixtures/recognition/manifest.json')).json();
  const refs=await Promise.all(Object.entries(map).map(async([name,src])=>{const image=new Image();image.src='/dist/'+src;await image.decode();return {name,templates:prepareIconTemplates(image,()=>document.createElement('canvas'))};}));
  const results=[];
  for(const file of Object.keys(manifest.lead).filter(f=>f.includes('validation'))){
   const image=new Image();image.src='/tests/fixtures/recognition/'+file;await image.decode();
   for(const side of ['mine','opp'])detectedLeadRects(image,side);
   const start=performance.now();
   for(const side of ['mine','opp'])for(const [i,rect]of detectedLeadRects(image,side).entries()){
    const crop=cropRecognitionRect(image,rect),canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.drawImage(crop,0,0,32,32);
    const result=rankIconTemplates(ctx.getImageData(0,0,32,32).data,refs);
    results.push({file,side,slot:i+1,expected:typeof manifest.lead[file][side][i]==='string'?manifest.lead[file][side][i]:null,candidates:result.candidates});
   }
   console.log(file,performance.now()-start);
  }
  const known=results.filter(r=>r.expected);return {summary:{known:known.length,top1:known.filter(r=>r.candidates[0].name===r.expected).length,top5:known.filter(r=>r.candidates.some(c=>c.name===r.expected)).length},results};
 });
 await writeFile(path.join(root,'reports/icon-template-benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log(report.summary);
}finally{await browser.close();server.close();}
