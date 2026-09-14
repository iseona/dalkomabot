import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const endpoint = process.env.RECOGNITION_ENDPOINT;
if (!endpoint) throw Error('RECOGNITION_ENDPOINT is required');
const manifest = JSON.parse(await readFile(path.join(root, 'tests/fixtures/recognition/manifest.json'), 'utf8'));
const requested = process.argv.slice(2);
const leadFiles = requested.length ? requested.filter(file => file !== 'party') : Object.keys(manifest.lead);
const sheetOnly = process.env.SHEET_ONLY === '1';

const types = new Map([['.mjs', 'text/javascript'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.html', 'text/html']]);
const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const file = path.resolve(root, relative || 'dist/index.html');
    response.setHeader('content-type', types.get(path.extname(file)) || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel: 'msedge', headless: true});
const page = await browser.newPage();
const origin = `http://127.0.0.1:${server.address().port}`;
await page.goto(`${origin}/dist/index.html`);

async function leadSheet(file) {
  return page.evaluate(async ({origin, file}) => {
    const layout = await import(`${origin}/dist/local-image-recognition.mjs`);
    const sheet = await import(`${origin}/dist/recognition-contact-sheet.mjs`);
    const blob = await (await fetch(`${origin}/tests/fixtures/recognition/${file}`)).blob();
    return (await sheet.buildLeadContactSheet(new File([blob], file, {type: blob.type}), layout.detectedLeadRects)).dataUrl;
  }, {origin, file});
}

async function partySheet() {
  return page.evaluate(async origin => {
    const sheet = await import(`${origin}/dist/recognition-contact-sheet.mjs`);
    const files = [];
    for (const name of ['party-ability.jpg', 'party-stats.jpg']) {
      const blob = await (await fetch(`${origin}/tests/fixtures/recognition/${name}`)).blob();
      files.push(new File([blob], name, {type: blob.type}));
    }
    return (await sheet.buildPartyContactSheet(files)).dataUrl;
  }, origin);
}

async function call(kind, images) {
  const started = performance.now();
  const response = await fetch(endpoint, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({mode: 'single', kind, images})});
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = {raw: text}; }
  return {status: response.status, seconds: Math.round((performance.now() - started) / 100) / 10, body};
}

// Exercise the production client, including its legend, rather than rebuilding
// a different request in the test. Record payload metadata without image data.
async function productionCall(kind, names) {
  return page.evaluate(async ({origin, endpoint, kind, names}) => {
    const {recognizeImages} = await import(`${origin}/dist/ai-recognition.mjs`);
    const {detectedLeadRects} = await import(`${origin}/dist/local-image-recognition.mjs`);
    const files = await Promise.all(names.map(async name => {
      const blob = await (await fetch(`${origin}/tests/fixtures/recognition/${name}`)).blob();
      return new File([blob], name, {type: blob.type});
    }));
    const started = performance.now();
    let status, imageCount;
    const body = await recognizeImages({files, mode: 'single', kind, endpoint,
      leadRectDetector: detectedLeadRects,
      fetchImpl: async (url, options) => {
        imageCount = JSON.parse(options.body).images.length;
        if (kind === 'lead' && imageCount !== 2) throw Error('Lead request must include screenshot and legend');
        const response = await fetch(url, options);
        status = response.status;
        return response;
      },
    });
    return {status, imageCount, seconds: Math.round((performance.now()-started)/100)/10, body};
  }, {origin, endpoint, kind, names});
}

const report = {generatedAt: new Date().toISOString(), endpoint, lead: {}, party: null};
try {
  for (const file of leadFiles) {
    const image = await leadSheet(file);
    if (sheetOnly) {
      await writeFile(path.join(root, `tests/fixtures/recognition/contact-${path.parse(file).name}.jpg`), Buffer.from(image.split(',')[1], 'base64'));
      continue;
    }
    const result = await productionCall('lead', [file]);
    report.lead[file] = result;
    console.log(file, result.status, `${result.seconds}s`, JSON.stringify(result.body));
  }
  if (!requested.length || requested.includes('party')) {
    const image = await partySheet();
    if (sheetOnly) {
      await writeFile(path.join(root, 'tests/fixtures/recognition/contact-party.jpg'), Buffer.from(image.split(',')[1], 'base64'));
    } else {
      report.party = await productionCall('party', ['party-ability.jpg', 'party-stats.jpg']);
      console.log('party', report.party.status, `${report.party.seconds}s`, JSON.stringify(report.party.body));
    }
  }
  await writeFile(path.join(root, 'tests/fixtures/recognition/api-validation-report.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
  server.close();
}
