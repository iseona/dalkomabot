export function buildAdviceInput({mode,season,selected,candidates,replace=false,teamProfile=null}){
 teamProfile=teamProfile||candidates?.[0]?.teamProfile||null;
 const evidence=[],add=(kind,text)=>{const id=`e${evidence.length+1}`;evidence.push({id,kind,text});return id};
 const teamRefs=(teamProfile?.gaps||[]).map(text=>add('team-gap',`현재 파티: ${text}`));
 const options=candidates.slice(0,3).map(c=>{
  const refs=[...teamRefs],f=c.facts||{};
  for(const type of f.weakness?.repaired||[])refs.push(add('type',`${c.p.name}: ${type} 공통 약점 보완`));
  for(const type of f.weakness?.added||[])refs.push(add('warning',`${c.p.name}: 새 약점 ${type}`));
  for(const name of f.meta||[])refs.push(add('meta',`${c.p.name}: ${name} 타입 대응 후보`));
  for(const name of f.synergy?.teammates||[])refs.push(add('team',`${c.p.name}: ${name} 팀메이트 연결`));
  const role=f.role;
  if(role){
   refs.push(add('role',`${c.p.name}: ${role.roles?.join(', ')||'복합 역할'}; EV ${role.evs?.join('/')}; ${role.nature||'성격 미확인'}; 기본S ${role.baseSpeed}; 실스피드 ${role.speed}; 물리/특수 내구 ${role.physicalBulk}/${role.specialBulk}`));
   refs.push(add('set',`${c.p.name}: 기술 ${[...(role.physicalMoves||[]),...(role.specialMoves||[]),...(role.setup||[]),...(role.utility||[])].join(', ')||'미확인'}; 특성 ${role.ability||'미확인'}; 도구 ${role.item||'미확인'}`));
   if(role.intimidate||role.rockyHelmet)refs.push(add('pressure',`${c.p.name}: ${[role.intimidate?'위협':'',role.rockyHelmet?'울퉁불퉁멧':''].filter(Boolean).join(' + ')} 기반 물리 압박`));
  }
  refs.push(add('score',`${c.p.name}: 결정론적 추천 점수 ${c.score}점`));
  return {name:c.p.name,rank:c.p.rank,score:c.score,evidenceIds:refs};
 });
 return {schemaVersion:1,mode,season,kind:replace?'replace':'add',selected:selected.map(s=>s.name||s),teamProfile:teamProfile?{counts:teamProfile.counts,gaps:teamProfile.gaps}:null,candidates:options,evidence};
}

export function validateAdviceResponse(value,input){
 if(!value||value.schemaVersion!==1||!Array.isArray(value.advice)||value.advice.length>3)throw Error('AI 제언 응답 형식이 올바르지 않습니다.');
 const candidates=new Map(input.candidates.map(c=>[c.name,new Set(c.evidenceIds)]));
 return value.advice.map(item=>{
  if(!item||typeof item.name!=='string'||!candidates.has(item.name)||typeof item.summary!=='string'||item.summary.length>360||!Array.isArray(item.evidenceIds)||!item.evidenceIds.length||item.evidenceIds.some(id=>!candidates.get(item.name).has(id)))throw Error('AI 제언 근거가 결정론적 분석과 일치하지 않습니다.');
  return {name:item.name,summary:item.summary.trim(),evidenceIds:item.evidenceIds};
 });
}
