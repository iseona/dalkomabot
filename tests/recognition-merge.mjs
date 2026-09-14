import assert from 'node:assert/strict';
import {mergeLeadRecognition,mergePartyRecognition} from '../dist/recognition-merge.mjs';

const known = new Set(['알로라 나인테일', '프테라', '한카리아스']);
const isKnown = name => known.has(name);

const party = mergePartyRecognition(
  [{slot: 1, name: null, evs: [2, 32, 0, 0, 0, 32], confidence: .9}],
  [{name: '프테라', confidence: .8, candidates: [{name: '프테라'}]}],
  isKnown,
);
assert.equal(party[0].name, '프테라');
assert.deepEqual(party[0].evs, [2, 32, 0, 0, 0, 32]);

const lead = mergeLeadRecognition(
  {mine: [{slot: 1, name: '한카리아스', confidence: .7, notes: ''}], opp: [{slot: 1, name: null, confidence: .4, notes: ''}]},
  {mine: [{name: '알로라 나인테일', confidence: .95, candidates: [{name: '알로라 나인테일'}]}], opp: [{name: '', confidence: 0, candidates: [{name: '프테라'}], reason: '불확실'}]},
  isKnown,
);
assert.equal(lead.mine[0].name, '알로라 나인테일');
assert.equal(lead.opp[0].name, '');
assert.deepEqual(lead.opp[0].candidates, ['프테라']);
console.log('PASS: local icon result and AI text result merge deterministically.');
