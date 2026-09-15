export function statsAtLevel(base,evs,ivs,nature,level=50){
 const keys=['hp','atk','def','spa','spd','spe'];
 if(!Array.isArray(base)||!Array.isArray(evs)||!Array.isArray(ivs)||base.length!==6||evs.length!==6||ivs.length!==6||!Number.isInteger(level)||level<1||level>100||ivs.some(v=>!Number.isInteger(v)||v<0||v>31))return null;
 return base.map((b,i)=>{const core=Math.floor((2*Number(b)+ivs[i])*level/100)+(i?5:level+10)+Number(evs[i]||0),mult=keys[i]===nature?.[2]?1.1:keys[i]===nature?.[3]?0.9:1;return i?Math.floor(core*mult):core});
}
export function advancedBattleMultiplier({category,type,status,ability,manual=1,powerSpot,flowerGift,flowerGiftDefense,weather,steelSpirit,fairyAura,darkAura,auraBreak,tabletsOfRuin,swordOfRuin,vesselOfRuin,beadsOfRuin,friendGuard,doubleSpread,wall,doubleBattle,critical,attackerRank=0,defenderRank=0}={}){
 let attack=1,defense=1,final=Number(manual);
 if(!Number.isFinite(final)||final<=0)return null;
 const stage=n=>n>=0?(2+n)/2:2/(2-n);if(critical&&attackerRank<0)attack/=stage(attackerRank);if(critical&&defenderRank>0)defense/=stage(defenderRank);if(status==='화상'&&category==='물리'&&ability!=='근성')attack*=.5;
 if(powerSpot)final*=1.3;if(weather==='쾌청'&&flowerGift&&category==='물리')attack*=1.5;if(weather==='쾌청'&&flowerGiftDefense&&category==='특수')defense*=1.5;if(steelSpirit&&type==='강철')final*=1.5;
 let aura=(fairyAura&&type==='페어리'||darkAura&&type==='악')?4/3:1;if(auraBreak&&aura!==1)aura=3/4;final*=aura;
 if(tabletsOfRuin&&category==='물리')attack*=.75;if(vesselOfRuin&&category==='특수')attack*=.75;if(swordOfRuin&&category==='물리')defense*=.75;if(beadsOfRuin&&category==='특수')defense*=.75;
 if(friendGuard)final*=.75;if(doubleSpread)final*=.75;if(wall&&((wall==='오로라베일')||(wall==='리플렉터'&&category==='물리')||(wall==='빛의장막'&&category==='특수'))){final*=2;if(!critical)final*=doubleBattle?2/3:.5}
 return {attack,defense,final,total:attack/defense*final};
}
