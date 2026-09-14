import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = new Map([
  ['.js', 'text/javascript'], ['.mjs', 'text/javascript'], ['.json', 'application/json'],
  ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.html', 'text/html'],
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
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  const results = await page.evaluate(async ({base, requested}) => {
    const module = await import(`${base}/dist/local-image-recognition.mjs`);
    const iconMap = await (await fetch(`${base}/dist/champions-icon-map.json`)).json();
    const absoluteMap = Object.fromEntries(
      Object.entries(iconMap).map(([name, source]) => [name, `${base}/dist/${source}`]),
    );
    const references = await module.loadOfficialIconReferences(absoluteMap);
    const screenMap = await (await fetch(`${base}/dist/recognition-screen-map.json`)).json();
    const absoluteScreenMap = screenMap.map(entry => ({
      ...entry,
      src: `${base}/dist/${entry.src}`,
    }));
    references.push(...await module.loadScreenIconReferences(absoluteScreenMap));
    const fixtures = [
      ['lead-alolan-ninetales.webp', 'lead'],
      ['lead-eternal-flower.jpg', 'lead'],
      ['party-stats.jpg', 'party'],
      ['party-ability.jpg', 'party'],
      ['lead-validation-01.png', 'lead'],
      ['lead-validation-02.png', 'lead'],
      ['lead-validation-03.png', 'lead'],
      ['lead-validation-04.png', 'lead'],
    ];
    const selectedFixtures = requested.length
      ? fixtures.filter(([file]) => requested.includes(file))
      : fixtures;
    const output = {};
    for (const [file, kind] of selectedFixtures) {
      const image = new Image();
      image.src = `${base}/tests/fixtures/recognition/${file}`;
      await image.decode();
      const signature = module.imageSignature(image);
      const signatureMatches = [...new Map(screenMap.map(entry => [entry.fixture, entry.fixtureSignature])).entries()]
        .map(([fixture, expected]) => ({fixture, distance: expected && expected.reduce((sum, value, index) => sum + Math.abs(value - signature[index]), 0)}))
        .sort((left, right) => left.distance - right.distance);
      output[file] = {
        signatureMatches: signatureMatches.slice(0, 3),
        fitted: module.recognizeFixedLayout(image, kind, references),
        self: module.recognizeFixedLayout(
          image,
          kind,
          references.filter(reference => reference.fixture === file),
        ),
        holdout: module.recognizeFixedLayout(
          image,
          kind,
          references.filter(reference => reference.fixture !== file),
        ),
      };
    }
    return output;
  }, {base: origin, requested: process.argv.slice(2)});
  for (const [file, variants] of Object.entries(results)) {
    console.log(file);
    console.log('signature matches', variants.signatureMatches);
    for (const [variant, result] of Object.entries(variants)) {
      if (variant === 'signatureMatches') continue;
      const groups = result.kind === 'party' ? {slots: result.slots} : result.sides;
      for (const [group, slots] of Object.entries(groups)) {
        console.log(variant, group, slots.map(slot =>
          `${slot.name || '?'} [${slot.candidates[0]?.name}:${slot.candidates[0]?.score.toFixed(3)}]`,
        ).join(' | '));
      }
    }
    if (file === 'lead-alolan-ninetales.webp') {
      console.log('required left 5 ranking', variants.holdout.sides.mine[4].candidates);
    }
    if (file === 'lead-validation-02.png') {
      console.log('validation-02 opponent 4 fitted ranking', variants.fitted.sides.opp[3].candidates);
      console.log('validation-02 opponent 4 fitted diagnostics', variants.fitted.sides.opp[3].diagnostics);
      console.log('validation-02 selected fixture', variants.fitted.sides.opp[3].screenFixture);
      console.log('validation-02 opponent 4 self ranking', variants.self.sides.opp[3].candidates);
    }
  }
} finally {
  await browser.close();
  server.close();
}


