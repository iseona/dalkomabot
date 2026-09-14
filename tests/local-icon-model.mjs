import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {iconFeatures, rankIcon, FEATURE_SIZE} from '../dist/icon-classifier.mjs';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const model = JSON.parse(await readFile(path.join(root, 'dist/models/icon-ridge-v1.json')));
assert.equal(model.autoConfirm, false);
assert(!model.trainingSources.some(s => s.includes('validation')));
const binary = await readFile(path.join(root, 'dist/models/icon-ridge-v1.bin'));
const weights = new Float32Array(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
assert.equal(weights.length, model.names.length * FEATURE_SIZE);
assert(weights.every(Number.isFinite));
assert.equal(rankIcon(iconFeatures(new Uint8ClampedArray(4096)), model, weights).name, '');
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    const ext = path.extname(file);
    res.setHeader('content-type', ['.js','.mjs'].includes(ext) ? 'text/javascript' : ext === '.html' ? 'text/html' : ext === '.json' ? 'application/json' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel:'msedge', headless:true});
try {
  const page = await browser.newPage();
  let posts = 0;
  const imageRequests = [];
  page.on('request', request => { if (request.method() === 'POST') posts++; imageRequests.push(request.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/dist/index.html`);
  const report = await page.evaluate(async () => {
    const {recognizeLeadOnDevice} = await import('/dist/local-icon-model.mjs');
    const manifest = await (await fetch('/tests/fixtures/recognition/manifest.json')).json();
    const screens = [];
    for (const filename of Object.keys(manifest.lead).filter(f => f.includes('validation') || f === 'lead-alolan-ninetales.webp')) {
      const blob = await (await fetch('/tests/fixtures/recognition/' + filename)).blob();
      const start = performance.now();
      // Exclude ALL exact reference crops: no test screenshot leakage.
      const result = await recognizeLeadOnDevice(new File([blob], filename), {references: []});
      const elapsedMs = Math.round(performance.now() - start);
      const slots = ['mine','opp'].flatMap(side => result.sides[side].map((slot, i) => ({
        side, slot: i+1, expected: typeof manifest.lead[filename][side][i] === 'string' ? manifest.lead[filename][side][i] : null,
        confirmed: slot.name, candidates: slot.candidates.map(c => c.name),
      })));
      const {detectedLeadRects}=await import('/dist/local-image-recognition.mjs');
      const bitmap=await createImageBitmap(blob);
      const rects={mine:detectedLeadRects(bitmap,'mine'),opp:detectedLeadRects(bitmap,'opp')};bitmap.close();
      screens.push({filename, elapsedMs, warning:result.warning, slots,rects,crops:['mine','opp'].flatMap(side=>result.sides[side].map(slot=>slot.crop))});
    }
    return {screens};
  });
  for(const screen of report.screens){for(let i=0;i<screen.crops.length;i++)await writeFile(path.join(root,`reports/crop-${screen.filename}-${i}.webp`),Buffer.from(screen.crops[i].split(',')[1],'base64'));delete screen.crops;}
  const slots = report.screens.flatMap(s => s.slots), known = slots.filter(s => s.expected);
  assert(report.screens.every(s => !s.warning), 'Worker and icon DB must actually load');
  assert(slots.every(s => !s.confirmed), 'Uncalibrated model must never auto-confirm');
  assert(slots.every(s => s.candidates.length === 5));
  report.summary = {knownSlots:known.length, pendingSlots:slots.length-known.length,
    top1:known.filter(s => s.candidates[0] === s.expected).length,
    top5:known.filter(s => s.candidates.includes(s.expected)).length,
    automaticConfirmations:0, algorithm:'masked-color-template', unusedExperimentalModelBytes:binary.length, paidRequests:posts};
  assert.equal(posts, 0);
  // Real application upload must not silently invoke recognition APIs.
  await page.locator('[data-tab="lead"]').click();
  await page.locator('#leadFile').setInputFiles(path.join(root, 'tests/fixtures/recognition/lead-validation-03.png'));
  await page.waitForFunction(() => document.querySelector('#leadStatus')?.textContent.includes('기기 내 인식 완료'), {timeout:30000});
  assert.equal(posts, 0, 'Default upload must not make a paid POST');
  assert.equal(await page.locator('#leadAI').isEnabled(), true);
  assert.equal(await page.locator('#leadMine .leadslot img').count(), 6);
  assert(!imageRequests.some(url => /\/(?:sprites(?:-home|-shiny)*\/|sprite(?:-home|-shiny)*-map\.json)/.test(url)), 'Application must not load PokeAPI assets');
  assert(!imageRequests.some(url => url.includes('icon-ridge-v1')), 'Rejected learned model must not load at runtime');
  const rendered = await page.locator('.monpic img').evaluateAll(images => images.map(img => img.getAttribute('src')));
  assert(rendered.length > 0);
  assert(rendered.every(src => src.startsWith('champions-images/')));
  await page.waitForFunction(() => [...document.querySelectorAll('.monpic img')].some(img => img.naturalWidth === 512));
  // Explicit opt-in sends one mocked request; no real paid API is contacted.
  await page.evaluate(() => { globalThis.DALKOMA_CONFIG = {recognitionEndpoint: location.origin + '/mock-recognize'}; });
  await page.route('**/mock-recognize', route => route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({
    schemaVersion:1,kind:'lead',slots:[],sides:Object.fromEntries(['mine','opp'].map(side=>[side,Array.from({length:6},(_,i)=>({slot:i+1,name:'',item:'',ability:'',nature:'',moves:[],evs:Array(6).fill(null),confidence:0,notes:''}))])),
  })}));
  await page.locator('#leadAI').click();
  await page.waitForFunction(() => document.querySelector('#leadStatus')?.textContent.includes('AI 보조 인식 완료'));
  assert.equal(posts,1,'AI opt-in should make exactly one stubbed request');
  report.summary.explicitOptInMockRequests = posts;
  await writeFile(path.join(root, 'reports/local-icon-model-validation.json'), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));
  console.log('PASS: worker inference, held-out screens, no automatic guesses, and zero default image POSTs.');
} finally { await browser.close(); server.close(); }
