import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateRecognitionResult} from '../dist/ai-recognition.mjs';

const valid={schemaVersion:1,kind:'party',slots:Array.from({length:6},(_,index)=>({slot:index+1,name:index===0?'달코퀸':null,item:null,ability:null,nature:null,moves:[],evs:[2,32,0,0,0,32],confidence:.9,notes:''}))};
const result=validateRecognitionResult(structuredClone(valid));
assert.equal(result.slots.length,6);
assert.equal(result.slots[0].name,'달코퀸');
assert.deepEqual(result.slots[0].evs,[2,32,0,0,0,32]);
assert.throws(()=>validateRecognitionResult({...valid,slots:valid.slots.slice(1)}));
assert.throws(()=>validateRecognitionResult({...valid,slots:valid.slots.map((slot,index)=>index?slot:{...slot,evs:[33,0,0,0,0,0]})}));
const recognizer=fs.readFileSync(new URL('../aws/recognizer.py',import.meta.url),'utf8');
assert.match(recognizer,/UpdateExpression='SET expiresAt = :ttl ADD requests :one'/);
assert.doesNotMatch(recognizer,/UpdateExpression='ADD requests :one SET expiresAt = :ttl'/);
const lead={schemaVersion:1,kind:'lead',sides:{mine:structuredClone(valid.slots),opp:structuredClone(valid.slots)}};
assert.equal(validateRecognitionResult(lead).sides.opp.length,6);
assert.throws(()=>validateRecognitionResult({...lead,sides:{mine:lead.sides.mine,opp:lead.sides.opp.slice(1)}}));
console.log('PASS: AI recognition response schema, EV bounds, and DynamoDB quota expression.');
