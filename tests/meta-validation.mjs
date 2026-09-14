import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTopMeta,metaValidationHtml} from '../dist/meta-validation.mjs';
import {makeSet} from '../dist/engine.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data.json',import.meta.url)));
const open=JSON.parse(fs.readFileSync(new URL('../dist/opendata.json',import.meta.url)));
for(const mode of ['single','double']){
  const rows=data.modes[mode],members=rows.slice(0,6).map(row=>makeSet(row));
  const report=validateTopMeta({members,rows,open:open.modes[mode],master:data.master});
  assert.equal(report.checks.length,20);
  assert(report.checks.every(check=>check.members.length===6));
  assert(report.checks.flatMap(check=>check.members).some(member=>member.attack&&member.defense&&member.opponentSpeeds.length===6));
  const missing=validateTopMeta({members,rows,open:null,master:data.master});
  assert.equal(missing.complete,false);
  assert(metaValidationHtml(missing,String).includes('검증 미완료'));
}
console.log('PASS: both modes verify top 20; missing data cannot count as verified.');
