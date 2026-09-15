import assert from 'node:assert/strict';
import {statsAtLevel,advancedBattleMultiplier as factor} from '../dist/calculator-rules.mjs';
assert.deepEqual(statsAtLevel([108,130,95,80,85,102],[2,32,0,0,0,32],[31,31,31,31,31,31],null,50),[185,182,115,100,105,154]);
assert.equal(statsAtLevel([1,1,1,1,1,1],[0,0,0,0,0,0],[32,31,31,31,31,31],null,50),null);
assert.equal(factor({category:'물리',status:'화상',ability:''}).total,.5);assert.equal(factor({category:'물리',status:'화상',ability:'근성'}).total,1);
for(const [key,value] of [['powerSpot',1.3],['steelSpirit',1.5],['friendGuard',.75],['doubleSpread',.75],['tabletsOfRuin',.75],['swordOfRuin',1/.75],['vesselOfRuin',.75],['beadsOfRuin',1/.75]]){const args={category:key.includes('vessel')||key.includes('beads')?'특수':'물리',type:key==='steelSpirit'?'강철':'노말',[key]:true};assert.equal(factor(args).total,value,key)}
assert.equal(factor({category:'물리',weather:'쾌청',flowerGift:true}).total,1.5);assert.equal(factor({category:'물리',weather:'비',flowerGift:true}).total,1);
assert.equal(factor({category:'특수',type:'페어리',fairyAura:true}).total,4/3);assert.equal(factor({category:'특수',type:'악',darkAura:true,auraBreak:true}).total,.75);
assert.equal(factor({manual:1.25}).total,1.25);assert.equal(factor({manual:0}),null);
assert.equal(factor({category:'특수',weather:'쾌청',flowerGiftDefense:true}).total,2/3);
assert.equal(factor({category:'물리',wall:'리플렉터',doubleBattle:false}).total,1);assert.equal(factor({category:'물리',wall:'리플렉터',doubleBattle:true}).total,4/3);
assert.equal(factor({category:'물리',wall:'리플렉터',critical:true,attackerRank:-2,defenderRank:2}).total,8);
console.log('PASS: level/IV stats and advanced battle multipliers.');
