import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright'),root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/dist/index.html`);
 page.on('console',m=>{if(m.text().includes('party-layout-components'))console.log(m.text());});
 const result=await page.evaluate(async()=>{
  const {detectedPartyCardRects,readPartyNatureArrows}=await import('/dist/recognition-contact-sheet.mjs');
  const results=[];let seed=81291;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const transforms=[[1,0,0,0,0],[.5,0,0,0,0],[.75,170,80,90,140],[.65,40,350,210,90],...Array.from({length:12},()=>[.5+random()*.65,...Array.from({length:4},()=>Math.floor(random()*400))])];
  for(const prefix of ['','cross-','wide-'])for(const type of ['ability','stats']){
   const b=await createImageBitmap(await(await fetch(`/tests/fixtures/recognition/${prefix}party-${type}.${prefix==='wide-'?'png':'jpg'}`)).blob());
   let base;
   for(const [scale,left,top,right,bottom] of transforms){
    const c=document.createElement('canvas');c.width=Math.round(b.width*scale)+left+right;c.height=Math.round(b.height*scale)+top+bottom;
    const ctx=c.getContext('2d');ctx.fillStyle='#202020';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(b,left,top,Math.round(b.width*scale),Math.round(b.height*scale));
    try{const rects=detectedPartyCardRects(c),arrows=readPartyNatureArrows(c);if(!base)base=rects;
     const error=Math.max(...rects.flatMap((r,i)=>['x','y','width','height'].map(k=>Math.abs((r[k]-(k==='x'?left:k==='y'?top:0))/scale-base[i][k])/base[i].width)));
     results.push({prefix,type,scale,left,top,rects,arrows,error});
    }catch(e){results.push({prefix,type,scale,left,top,failure:e.message});}
   }
   const incomplete=document.createElement('canvas');incomplete.width=b.width;incomplete.height=b.height;
   const ic=incomplete.getContext('2d');ic.drawImage(b,0,0);ic.fillStyle='#151515';ic.fillRect(base[0].x,base[0].y,base[0].width,base[0].height);
   let rejected=false;try{detectedPartyCardRects(incomplete);}catch{rejected=true;}
   if(!rejected)results.push({prefix,type,failure:'Missing card was silently accepted'});
   b.close();
  }return results;
 });
 await writeFile('reports/party-layout-adaptive.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({cases:result.length,failures:result.filter(r=>r.failure||r.error>.025),maxRelativeDrift:Math.max(...result.map(r=>r.error||0))},null,2));
 assert.equal(result.filter(r=>r.failure||r.error>.025).length,0);
 for(const r of result.filter(r=>r.type==='stats'))assert.equal(r.arrows.filter(Boolean).length,6);
}finally{await browser.close();server.close();}
