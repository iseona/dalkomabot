import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'tests/fixtures/recognition');
const output = path.join(root, 'dist/recognition-screen-icons');
const manifest = JSON.parse(await readFile(path.join(fixtures, 'manifest.json'), 'utf8'));
const types = new Map([['.mjs','text/javascript'],['.json','application/json'],['.jpg','image/jpeg'],['.png','image/png'],['.webp','image/webp'],['.html','text/html']]);

const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const file = path.resolve(root, relative || 'dist/index.html');
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    response.setHeader('content-type', types.get(path.extname(file)) || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end(); }
});

await mkdir(output, {recursive: true});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel:'msedge', headless:true});
try {
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/dist/index.html`);
  const records = [];
  for (const [filename, expected] of Object.entries(manifest.lead)) {
    const fixtureData = await page.evaluate(async ({origin, filename}) => {
      const recognition = await import(`${origin}/dist/local-image-recognition.mjs`);
      const image = new Image(); image.src = `${origin}/tests/fixtures/recognition/${filename}`; await image.decode();
      const result = [];
      for (const side of ['mine','opp']) {
        const rects = recognition.detectedLeadRects(image, side);
        for (let slot=0; slot<6; slot++) result.push({side,slot,data:recognition.cropRecognitionRect(image,rects[slot]).toDataURL('image/webp',.95)});
      }
      return {crops: result, signature: recognition.imageSignature(image)};
    }, {origin, filename});
    for (const image of fixtureData.crops) {
      const name = expected[image.side][image.slot];
      if (typeof name !== 'string') continue;
      const target = `lead-${String(records.length).padStart(3,'0')}.webp`;
      await writeFile(path.join(output,target),Buffer.from(image.data.split(',')[1],'base64'));
      records.push({name,src:`recognition-screen-icons/${target}`,kind:'lead',side:image.side,slot:image.slot,fixture:filename,fixtureSignature:fixtureData.signature});
    }
  }
  const partyNames = manifest.party.names;
  for (const filename of ['party-stats.jpg','party-ability.jpg']) {
    const fixtureData = await page.evaluate(async ({origin,filename}) => {
      const recognition=await import(`${origin}/dist/local-image-recognition.mjs`);
      const image=new Image();image.src=`${origin}/tests/fixtures/recognition/${filename}`;await image.decode();
      return {signature:recognition.imageSignature(image),crops:recognition.fixedSlotRects('party',image.width,image.height).map((rect,slot)=>({slot,data:recognition.cropRecognitionRect(image,rect).toDataURL('image/webp',.95)}))};
    },{origin,filename});
    for(const image of fixtureData.crops){const target=`party-${filename.includes('stats')?'stats':'ability'}-${image.slot}.webp`;await writeFile(path.join(output,target),Buffer.from(image.data.split(',')[1],'base64'));records.push({name:partyNames[image.slot],src:`recognition-screen-icons/${target}`,kind:'party',slot:image.slot,fixture:filename,fixtureSignature:fixtureData.signature});}
  }
  await writeFile(path.join(root,'dist/recognition-screen-map.json'),JSON.stringify(records,null,2)+'\n');
  console.log(`Built ${records.length} exact runtime icon references.`);
} finally { await browser.close(); server.close(); }
