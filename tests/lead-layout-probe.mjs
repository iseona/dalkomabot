import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const {chromium} = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const file = path.resolve(root, relative || 'dist/index.html');
    response.setHeader('content-type', file.endsWith('.mjs') ? 'text/javascript' : 'image/png');
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/dist/index.html`);
  for (let index = 1; index <= 4; index++) {
    const file = `lead-validation-0${index}.png`;
    const result = await page.evaluate(async ({origin, file}) => {
      const module = await import(`${origin}/dist/local-image-recognition.mjs`);
      const image = new Image();
      image.src = `${origin}/tests/fixtures/recognition/${file}`;
      await image.decode();
      return {
        size: [image.width, image.height],
        mine: module.detectedLeadRects(image, 'mine'),
        opp: module.detectedLeadRects(image, 'opp'),
      };
    }, {origin, file});
    console.log(file, JSON.stringify(result));
  }
} finally {
  await browser.close();
  server.close();
}
