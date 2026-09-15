import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'..'),types=new Map([['.html','text/html'],['.js','text/javascript'],['.mjs','text/javascript'],['.json','application/json'],['.css','text/css'],['.png','image/png'],['.webp','image/webp']]);
let server=null;
const target=process.env.TEST_SITE;
if(!target){server=createServer(async(req,res)=>{try{const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/+/, '')||'index.html',file=path.resolve(root,'dist',relative);res.setHeader('content-type',types.get(path.extname(file))||'application/octet-stream');res.end(await readFile(file))}catch{res.statusCode=404;res.end('not found')}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(target||`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await page.locator('[data-tab="calculators"]').click();
 assert.equal(await page.locator('#calcMove').getAttribute('list'),'calcMoves');assert((await page.locator('#calcMoves option').count())>100,'전체 기술 datalist가 비어 있음');
 await page.locator('#calcAtk').fill('메가한카리아스Z');await page.locator('#calcAtk').dispatchEvent('change');await page.waitForTimeout(50);assert.match(await page.locator('#calcAtkEvs').inputValue(),/^\d+(,\d+){5}$/,'메가폼이 기본종 EV를 상속하지 못함: '+errors.join(' / '));assert((await page.locator('#calcMoves option[label^="채용 기술"]').count())>0,'기본종 채용 기술이 표시되지 않음');
 assert.equal(await page.locator('#calcAtkItem').inputValue(),'한카리아스나이트Z','직접 선택한 메가폼의 전용 스톤이 우선되지 않음');
 await page.locator('#calcMove').fill('용의파동');await page.locator('#calcRun').click();assert.match(await page.locator('#calcResult').innerText(),/메가한카리아스Z/);assert.deepEqual(errors,[]);console.log('PASS: searchable move picker and direct Mega-form sample inheritance.');
 const first=Number((await page.locator('#calcResult').innerText()).match(/피해 범위\s*(\d+)/)?.[1]);await page.locator('#calcManualMultiplier').fill('2');await page.locator('#calcRun').click();const doubled=Number((await page.locator('#calcResult').innerText()).match(/피해 범위\s*(\d+)/)?.[1]);assert(doubled>=first*2-1,'수동 최종 배수가 결과에 반영되지 않음');for(const id of ['calcAtkIvs','calcDefIvs','calcAtkLevel','calcDefLevel','calcMoveType','calcMovePower','calcStatus','calcPowerSpot','calcFriendGuard'])assert.equal(await page.locator('#'+id).count(),1,id);
 await page.locator('#calcAtkLevel').fill('75');await page.locator('#calcReset').click();assert.equal(await page.locator('#calcAtkLevel').inputValue(),'50');assert.equal(await page.locator('#calcManualMultiplier').inputValue(),'1');
 assert.equal(await page.locator('#calcFlowerGiftDefense').count(),1);assert.equal(await page.locator('#calcSpread').count(),1);await page.locator('#calcRun').click();await page.waitForTimeout(20);assert.match(await page.locator('[data-spread-result]').innerText(),/자동 판정 불가/);
}finally{await browser.close();server?.close()}
