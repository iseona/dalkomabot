import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('tests/fixtures/recognition/manifest.json',root))),references=JSON.parse(await readFile(new URL('dist/recognition-screen-map.json',root)));
for(const entry of references){const expected=entry.kind==='lead'?manifest.lead[entry.fixture]?.[entry.side]?.[entry.slot]:manifest.party.names[entry.slot];assert.equal(entry.name,expected,`Wrong reference label: ${entry.src} (${entry.fixture}, ${entry.side||'party'} ${entry.slot+1})`);}
console.log(`PASS: ${references.length} stored crop labels agree with manually audited source manifest. This checks reference integrity, not unseen-image recognition.`);
