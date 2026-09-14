import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'..');
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();const ext=path.extname(file);res.setHeader('content-type',ext==='.js'||ext==='.mjs'?'text/javascript':ext==='.css'?'text/css':ext==='.html'?'text/html':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();let posts=0;page.on('request',r=>{if(r.method()==='POST')posts++;});
 await page.goto(`http://127.0.0.1:${server.address().port}/dist/index.html`);
 await page.locator('[data-tab="import"]').click();
 await page.locator('[data-ocrquery="0"]').fill('라이츄');
 await page.locator('[data-ocrcandidate="0"][data-name="라이츄"]').click();
 for(const id of ['ocr-0-items','ocr-0-abilities','ocr-0-natures',...Array.from({length:4},(_,i)=>'ocr-0-move-'+i)])assert.equal(await page.locator('#'+id).inputValue(),'');
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  const rects=await page.locator('.ocrmoves').first().locator('input').evaluateAll(inputs=>inputs.map(input=>{const r=input.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};}));
  assert.equal(rects.length,4);assert(Math.abs(rects[0].y-rects[1].y)<1);assert(Math.abs(rects[2].y-rects[3].y)<1);
  assert(rects[2].y>rects[0].y);assert(rects[1].x>rects[0].x);assert.equal(rects[0].x,rects[2].x);
 }
 await page.locator('#ocr-0-move-0').fill('전자포');await page.locator('#ocr-0-move-0').dispatchEvent('change');
 await page.locator('#ocr-0-move-2').fill('방어');await page.locator('#ocr-0-move-2').dispatchEvent('change');
 await page.locator('[data-ocrquery="0"]').fill('라이츄');await page.locator('.ocrmatches [data-ocrcandidate="0"][data-name="라이츄"]').click();
 assert.equal(await page.locator('#ocr-0-move-0').inputValue(),'전자포');assert.equal(await page.locator('#ocr-0-move-1').inputValue(),'');assert.equal(await page.locator('#ocr-0-move-2').inputValue(),'방어');assert.equal(await page.locator('#ocr-0-move-3').inputValue(),'');
 assert.equal(posts,0);
 console.log('PASS: actual UI species selection has no statistical autofill; sparse moves survive reselection; desktop/mobile 2x2 move order. No API calls.');
}finally{await browser.close();server.close();}
