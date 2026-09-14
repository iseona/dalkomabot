import {readFile} from 'node:fs/promises';
import {matchRecognizedText,speciesFromStats} from '../dist/recognition-text-validation.mjs';
import assert from 'node:assert/strict';
const master=JSON.parse(await readFile('dist/data.json')).master;
for(const prefix of ['', 'cross-']){
 const expected=prefix?JSON.parse(await readFile('tests/fixtures/recognition/cross-party-expected.json')):JSON.parse(await readFile('tests/fixtures/recognition/manifest.json')).party;
 const ocr=JSON.parse(await readFile(`reports/${prefix}local-party-text-probe.json`));
 let accepted=0;const failures=[];
 for(const row of ocr){const key=row.field.startsWith('move')?'moves':row.field==='item'?'items':'abilities';const found=matchRecognizedText(row.text,master[key].map(r=>r[0]));const target=key==='moves'?expected.details[row.slot-1].moves[Number(row.field.slice(4))-1]:expected.details[row.slot-1][row.field];if(found){accepted++;if(found.name!==target)failures.push({...row,found,target});}}
 console.log({prefix,accepted,total:ocr.length,failures});assert.equal(failures.length,0);
}
assert.equal(matchRecognizedText('',master.moves.map(r=>r[0])),null);
assert.deepEqual(speciesFromStats(master,[162,183,100,112,100,102],[2,32,0,0,0,32],master.natures.find(r=>r[0]==='고집')),['저리더프']);
assert.deepEqual(speciesFromStats(master,[162,183,100,112,100,102],[2,32,null,0,0,32],master.natures.find(r=>r[0]==='고집')),[]);
