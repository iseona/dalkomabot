import assert from 'node:assert/strict';
import {mergeLeadRecognition,mergePartyRecognition,localLeadResult} from '../dist/recognition-merge.mjs';

const known = new Set(['알로라 나인테일','나인테일','프테라','한카리아스','왕구리','핫삼','리자몽']);
const isKnown = name => known.has(name);
const evidence = {name:'프테라',confidence:.98,evidence:'slot-exact',candidates:[]};
const ai = {slot:1,name:'프테라',confidence:.9,evs:[2,32,0,0,0,32]};
assert.equal(mergePartyRecognition([ai],[evidence],isKnown)[0].name,'프테라');
assert.equal(mergePartyRecognition([{...ai,name:'한카리아스'}],[evidence],isKnown)[0].name,'');
assert.equal(mergePartyRecognition([{...ai,name:'',confidence:0}],[{...evidence,evidence:''}],isKnown)[0].name,'');
assert.equal(mergePartyRecognition([{...ai,confidence:.4}],[{}],isKnown)[0].name,'');
assert.deepEqual(mergePartyRecognition([ai],[evidence],isKnown)[0].evs,ai.evs);
const slots=[...known].slice(0,6).map(name=>({...evidence,name}));
const local={sides:{mine:structuredClone(slots),opp:structuredClone(slots)}};
assert(localLeadResult(local,isKnown));
local.sides.mine[2].evidence='';
assert.equal(localLeadResult(local,isKnown),null);
local.sides.mine[2].evidence='slot-exact';
local.sides.mine[2].name=local.sides.mine[0].name;
assert.equal(localLeadResult(local,isKnown),null);
const merged=mergeLeadRecognition({mine:[ai],opp:[{...ai,name:'나인테일'}]},
 {mine:[evidence],opp:[{...evidence,name:'알로라 나인테일'}]},isKnown);
assert.equal(merged.opp[0].name,'');
assert(merged.opp[0].notes.includes('달라'));
console.log('PASS: slot evidence required; conflicts, low confidence and duplicate local teams rejected.');
