import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright'),root=path.resolve(import.meta.dirname,'..');
const prefix=process.argv.includes('--cross')?'cross-':'';
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/dist/index.html`);
 const slots=await page.evaluate(async({prefix,scaled,erase})=>{const {readLocalPartyText}=await import('/dist/local-party-text.mjs');const files=await Promise.all(['ability','stats'].map(async type=>{let blob=await(await fetch(`/tests/fixtures/recognition/${prefix}party-${type}.jpg`)).blob();if(scaled||erase){const b=await createImageBitmap(blob),c=document.createElement('canvas');c.width=scaled?1280:b.width;c.height=scaled?720:b.height;c.getContext('2d').drawImage(b,0,0,c.width,c.height);if(erase){const {detectedPartyCardRects}=await import('/dist/recognition-contact-sheet.mjs');const r=detectedPartyCardRects(c)[0],ctx=c.getContext('2d');ctx.fillStyle='#9a85c9';const a=type==='stats'?[.285,.30,.08,.20]:[.665,.095,.29,.17];ctx.fillRect(r.x+r.width*a[0],r.y+r.height*a[1],r.width*a[2],r.height*a[3]);}blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));b.close();}return new File([blob],type+'.jpg',{type:'image/jpeg'});}));return readLocalPartyText(files);},{prefix,scaled:process.argv.includes('--720p'),erase:process.argv.includes('--erase')});
 await writeFile(path.join(root,`reports/${prefix}local-party-reader${process.argv.includes('--720p')?'-720p':''}.json`),JSON.stringify(slots,null,2));
 const expected=prefix?JSON.parse(await readFile('tests/fixtures/recognition/cross-party-expected.json')):JSON.parse(await readFile('tests/fixtures/recognition/manifest.json')).party;
 const failures=[];let accepted=0;
 for(let i=0;i<6;i++){
  for(const [field,value]of Object.entries({name:expected.names[i],item:expected.details[i].item,ability:expected.details[i].ability})){if(slots[i][field]){accepted++;if(slots[i][field]!==value)failures.push({slot:i+1,field,actual:slots[i][field],expected:value});}}
  for(const field of ['moves','evs'])for(let j=0;j<slots[i][field].length;j++){const actual=slots[i][field][j],expectedValue=field==='moves'?expected.details[i].moves[j]:expected.evs[i][j];if(actual!==null&&actual!==''){accepted++;if(actual!==expectedValue)failures.push({slot:i+1,field,index:j,actual,expected:expectedValue});}}
 }
 console.log(JSON.stringify({prefix,accepted,total:78,names:slots.map(s=>s.name),evs:slots.map(s=>s.evs),failures}));assert.equal(failures.length,0);
 if(process.argv.includes('--erase')){assert.equal(slots[0].name,'');assert.equal(slots[0].moves[0],'');assert.equal(slots[0].stats[0],null);}
}finally{await browser.close();server.close();}
