import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'tests/fixtures/recognition/manifest.json'), 'utf8'));
const contentTypes = new Map([
  ['.js', 'text/javascript'], ['.mjs', 'text/javascript'], ['.json', 'application/json'],
  ['.jpg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.html', 'text/html'],
]);

const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const file = path.resolve(root, relative || 'dist/index.html');
    if (!file.startsWith(root + path.sep)) throw Error('outside fixture root');
    response.setHeader('content-type', contentTypes.get(path.extname(file)) || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end('not found');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage();
  await page.goto(origin);
  const actual = await page.evaluate(async ({origin, leadFiles}) => {
    const recognition = await import(`${origin}/dist/local-image-recognition.mjs`);
    const iconMap = await (await fetch(`${origin}/dist/champions-icon-map.json`)).json();
    const screenMap = await (await fetch(`${origin}/dist/recognition-screen-map.json`)).json();
    const official = await recognition.loadOfficialIconReferences(Object.fromEntries(
      Object.entries(iconMap).map(([name, source]) => [name, `${origin}/dist/${source}`]),
    ));
    const screen = await recognition.loadScreenIconReferences(screenMap.map(entry => ({
      ...entry,
      src: `${origin}/dist/${entry.src}`,
    })));
    const references = [...official, ...screen];
    const recognize = async (file, kind) => {
      const image = new Image();
      image.src = `${origin}/tests/fixtures/recognition/${file}`;
      await image.decode();
      return recognition.recognizeFixedLayout(image, kind, references);
    };
    const lead = {};
    for (const file of leadFiles) lead[file] = await recognize(file, 'lead');
    return {
      lead,
      stats: await recognize('party-stats.jpg', 'party'),
      ability: await recognize('party-ability.jpg', 'party'),
    };
  }, {origin, leadFiles: Object.keys(manifest.lead)});

  let confirmed = 0;
  let pending = 0;
  for (const [file, expected] of Object.entries(manifest.lead)) {
    for (const side of ['mine', 'opp']) {
      expected[side].forEach((value, slot) => {
        const name = actual.lead[file].sides[side][slot].name;
        if (typeof value === 'string') {
          assert.equal(name, value, `${file} ${side} slot ${slot + 1}`);
          confirmed++;
        } else {
          assert.equal(name, '', `${file} ${side} pending slot ${slot + 1} must stay unresolved`);
          pending++;
        }
      });
    }
  }
  for (const [label, result] of [['stats', actual.stats], ['ability', actual.ability]]) {
    assert.deepEqual(result.slots.map(slot => slot.name), manifest.party.names, `party ${label} names`);
  }
  console.log(`PASS: ${confirmed} confirmed lead slots exact; ${pending} pending slots unresolved; party names 12/12 exact.`);
} finally {
  await browser.close();
  server.close();
}
