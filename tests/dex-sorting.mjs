import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..'),types=new Map([['.html','text/html'],['.js','text/javascript'],['.mjs','text/javascript'],['.json','application/json'],['.css','text/css'],['.png','image/png'],['.webp','image/webp']]);
const server=createServer(async(request,response)=>{try{const url=new URL(request.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'dist/index.html',file=path.resolve(root,relative.startsWith('dist/')?relative:`dist/${relative}`);if(!file.startsWith(path.join(root,'dist')+path.sep))throw Error('outside dist');response.setHeader('content-type',types.get(path.extname(file))||'application/octet-stream');response.end(await readFile(file))}catch{response.statusCode=404;response.end('not found')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
 await page.locator('[data-tab="dex"]').click();
 await page.locator('#pokemonDexSortKey').selectOption('atk');
 await page.locator('#pokemonDexSortDirection').selectOption('desc');
 const attackValues=await page.locator('#metarows tr td:nth-child(5) small').evaluateAll(cells=>cells.slice(0,10).map(cell=>Number(cell.textContent.match(/A(\d+)/)?.[1])));
 assert.deepEqual(attackValues,[...attackValues].sort((a,b)=>b-a),'포켓몬 도감 공격 종족값 내림차순 실패');

 await page.locator('[data-tab="meta"]').click();
 await page.locator('#pokemonDexSortKey').selectOption('rank');
 await page.locator('#pokemonDexSortDirection').selectOption('asc');
 assert.equal((await page.locator('#metarows tr td:first-child').first().textContent()).trim(),'1','메타 순위 오름차순 실패');

 await page.locator('[data-tab="dex"]').click();
 await page.locator('[data-dexcategory="moves"]').click();
 assert.equal(await page.locator('#dexMoveSort').isVisible(),true,'기술 정렬 누락');
 await page.locator('[data-dexcategory="abilities"]').click();
 assert.equal(await page.locator('[data-catalogsort="abilities"]').isVisible(),true,'특성 정렬 누락');
 await page.locator('[data-catalogsort="abilities"]').selectOption('name-desc');
 await page.locator('[data-dexcategory="items"]').click();
 assert.equal(await page.locator('[data-catalogsort="items"]').isVisible(),true,'도구 정렬 누락');
 assert.deepEqual(errors,[]);
 console.log('PASS: meta, Pokemon, move, ability, and item list sorting controls.');
}finally{await browser.close();server.close()}
