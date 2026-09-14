import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {makeSet} from '../dist/engine.mjs';

const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const data = JSON.parse(await readFile(path.join(root, 'dist/data.json'), 'utf8'));
const good = makeSet(data.modes.single[0]);
const saved = {single: [good, {name: '없는포켓몬'}, null, null, null, null], double: Array(6).fill(null)};
const blank = index => ({slot: index + 1, name: null, item: null, ability: null, nature: null, moves: [], evs: Array(6).fill(null), confidence: 0, notes: ''});

const types = new Map([
  ['.html', 'text/html'], ['.js', 'text/javascript'], ['.mjs', 'text/javascript'],
  ['.json', 'application/json'], ['.css', 'text/css'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/recognize') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({schemaVersion: 1, kind: 'lead', slots: [], sides: {mine: Array.from({length: 6}, (_, i) => blank(i)), opp: Array.from({length: 6}, (_, i) => blank(i))}}));
      return;
    }
    if (url.pathname === '/runtime-config.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end("globalThis.DALKOMA_CONFIG={recognitionEndpoint:'/recognize'};");
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'dist/index.html';
    const file = path.resolve(root, relative.startsWith('dist/') ? relative : `dist/${relative}`);
    if (!file.startsWith(path.join(root, 'dist') + path.sep)) throw Error('outside dist');
    response.setHeader('content-type', types.get(path.extname(file)) || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end('not found');
  }
});

await new Promise(resolve => server.listen(4179, '127.0.0.1', resolve));
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(value => localStorage.setItem('champions-party-v1', value), JSON.stringify(saved));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin, {waitUntil: 'networkidle'});

  for (const id of ['builder', 'meta', 'import', 'ranked', 'coverage', 'library', 'lead', 'calculators']) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `${id} section missing`);
    await page.locator(`[data-tab="${id}"]`).click();
    assert.equal(await page.locator(`#${id}`).getAttribute('hidden'), null, `${id} did not open`);
  }

  const repaired = await page.evaluate(() => ({
    saved: JSON.parse(localStorage.getItem('champions-party-v1')),
    backup: localStorage.getItem('champions-party-v1-backup'),
  }));
  assert.equal(repaired.saved.single[0].name, good.name);
  assert.equal(repaired.saved.single[1], null);
  assert.ok(repaired.backup);

  await page.locator('[data-tab="coverage"]').click();
  assert.equal(await page.locator('#coverageTable tbody tr').count(), 18);
  assert.match(await page.locator('#coverageParty').textContent(), new RegExp(good.name));
  assert.ok(await page.locator('#coverageRecommendations .coverage-rec').count() > 0);
  await page.locator('[data-tab="library"]').click();
  await page.locator('#librarySave').click();
  assert.ok(await page.locator('#libraryList .library-card').count() > 0);

  await page.locator('[data-tab="import"]').click();
  const partySearch = page.locator('[data-ocrquery="0"]');
  if (!await partySearch.count()) {
    console.error('PAGE_ERRORS', errors);
    console.error('OCR_HTML', (await page.locator('#ocrResults').innerHTML()).slice(0, 1000));
  }
  await partySearch.fill('나인테일 알로라폼');
  const partyChoice = page.locator('[data-ocrmatches="0"] [data-name="알로라 나인테일"]');
  await partyChoice.waitFor();
  await partyChoice.click();
  assert.match(await page.locator('#ocrResults .ocrrow').first().textContent(), /알로라 나인테일/);

  await page.locator('[data-tab="lead"]').click();
  await page.locator('#leadFile').setInputFiles(path.join(root, 'tests/fixtures/recognition/lead-validation-04.png'));
  await page.locator('[data-leadsearch="mine"]').first().waitFor({timeout: 30000});
  const leadSearch = page.locator('[data-leadsearch="mine"]').first();
  await leadSearch.fill('나인테일 알로라폼');
  const leadChoice = page.locator('[data-leadmatches="mine-0"] [data-leadname="알로라 나인테일"]');
  await leadChoice.waitFor();
  await leadChoice.click();
  assert.equal(await page.locator('[data-leadsearch="mine"]').first().inputValue(), '알로라 나인테일');
  assert.deepEqual(errors, []);
  console.log('PASS: six sections, slot repair backup, and party/lead Alolan Ninetales autocomplete.');
} finally {
  await browser.close();
  server.close();
}
