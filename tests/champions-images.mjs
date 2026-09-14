import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const json = async file => JSON.parse(await readFile(path.join(root, file)));
const data = await json('dist/data.json'), catalog = await json('dist/champions-image-catalog.json');
const map = await json('dist/champions-image-map.json'), icons = await json('dist/champions-icon-map.json');
assert.equal(catalog.unresolved.length, 0, 'Every requested master image must be resolved');
assert.equal(Object.keys(map).length, data.master.pokemon.length);
const keys = new Set();
for (const entry of catalog.entries) {
  assert.equal(map[entry.name], entry.src);
  assert(entry.src.startsWith('champions-images/'));
  assert.equal(entry.width,512); assert.equal(entry.height,512);
  assert(!keys.has(entry.key), 'Distinct forms must not silently use the same key'); keys.add(entry.key);
  const bytes = await readFile(path.join(root,'dist',entry.src));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
}
for (const name of new Set(Object.values(data.modes).flat().map(p=>p.name))) assert(icons[name]);
for (const [a,b] of [['리자몽','메가리자몽X'],['메가리자몽X','메가리자몽Y'],['라이츄','알로라 라이츄'],['킬가르도(실드폼)','킬가르도(블레이드폼)'],['돌핀맨(나이브폼)','돌핀맨(마이티폼)']]) assert.notEqual(map[a],map[b]);
const app=await readFile(path.join(root,'dist/app.js'),'utf8');
assert(app.includes("fetch('champions-image-map.json')"));
assert(!/fetch\('sprite[^']*-map\.json'\)/.test(app));
console.log(`PASS: ${catalog.entries.length} original 512px images, hashes, distinct forms, all current recognition references, no PokeAPI display maps.`);
