import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    if (file.endsWith('.mjs')) res.setHeader('content-type', 'text/javascript');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/dist/index.html`);
  const data = await page.evaluate(async () => {
    const {iconFeatures} = await import('/dist/icon-classifier.mjs');
    const map = await (await fetch('/dist/champions-icon-map.json')).json();
    const screen = await (await fetch('/dist/recognition-screen-map.json')).json();
    const sources = ['lead-eternal-flower.jpg', 'lead-alolan-ninetales.webp'];
    const entries = [...Object.entries(map).map(([name, src]) => ({name, src, official: true})),
      ...screen.filter(e => e.kind === 'lead' && sources.includes(e.fixture))];
    const names = [...new Set(entries.map(e => e.name))].sort();
    let seed = 190914;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const features = [], labels = [];
    for (const entry of entries) {
      const image = new Image(); image.src = '/dist/' + entry.src; await image.decode();
      for (let n = 0; n < 48; n++) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const blue = random() > .5;
        ctx.fillStyle = blue ? `rgb(${25+random()*45},${25+random()*45},${95+random()*75})`
          : `rgb(${90+random()*75},${25+random()*45},${25+random()*45})`;
        ctx.fillRect(0, 0, 32, 32);
        const size = entry.official ? 17 + random()*14 : 28 + random()*8;
        const x = (32-size)/2 + (random()-.5)*5, y = (32-size)/2 + (random()-.5)*5;
        ctx.filter = `brightness(${.8+random()*.4})`;
        ctx.drawImage(image, x, y, size, size);
        features.push(Array.from(iconFeatures(ctx.getImageData(0,0,32,32).data)));
        labels.push(names.indexOf(entry.name));
      }
    }
    return {names, features, labels, sources: ['champions-icon-map.json', ...sources]};
  });
  await mkdir(path.join(root, '.local-icon-training'), {recursive: true});
  await writeFile(path.join(root, '.local-icon-training/features.json'), JSON.stringify(data));
  console.log(`Exported ${data.features.length} examples, ${data.names.length} classes; four validation screens excluded.`);
} finally { await browser.close(); server.close(); }
