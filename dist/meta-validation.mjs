import {battleCalculation,makeSet,speedVariants} from './engine.mjs';

export function validateTopMeta({members,rows,open,master}) {
  const targets=[...(open?.frequency || [])].sort((a,b)=>b.rate-a.rate).slice(0,20);
  const checks=targets.map(target=>{
    const opponent=rows.find(row=>row.name===target.name);
    if(!opponent)return {...target,complete:false,members:[],reason:'상대 상세 통계 없음'};
    const opponentSet=makeSet(opponent);
    const speeds=speedVariants(opponent,master);
    const results=members.map(set=>{
      const member=rows.find(row=>row.name===set.name);
      if(!member)return {name:set.name,complete:false};
      const calculate=(attacker,defender,attackerSet,names,evs,options)=>names.map(name=>{
        const move=master.moves.find(move=>move[0]===name);
        const calc=battleCalculation(attacker,defender,attackerSet,move,evs,master,options);
        return calc?{move:name,min:calc.result.minPct,max:calc.result.maxPct,speed:calc.speed}:null;
      }).filter(Boolean).sort((a,b)=>b.max-a.max);
      const outgoing=calculate(member,opponent,set,set.moves,opponentSet.evs,{defenderNature:opponentSet.natures});
      const incoming=calculate(opponent,member,opponentSet,opponentSet.moves,set.evs,{defenderNature:set.natures});
      return {name:set.name,complete:Boolean(speeds && outgoing.length && incoming.length),
        attack:outgoing[0]||null,defense:incoming[0]||null,
        speed:outgoing[0]?.speed ?? null,opponentSpeeds:speeds,
        reason:!outgoing.length||!incoming.length?'공격 계산에 필요한 데이터가 부족합니다.':''};
    });
    return {...target,complete:results.length>0 && results.every(result=>result.complete),members:results};
  });
  return {required:20,complete:checks.length===20 && checks.every(check=>check.complete),
    season:open?.season||'',updatedAt:open?.updatedAt||'',checks};
}

export function metaValidationHtml(report,escape) {
  const checked=report.checks.filter(check=>check.complete).length;
  const percent=value=>value?`${escape(value.move)} ${value.min}~${value.max}%`:'계산 자료 부족';
  return `<section class="analysisitem"><h3>상위 메타 20종 공격·내구·스피드 검증</h3>
    <p>${report.complete?'기준 시나리오 검증 완료':'검증 미완료'} · ${checked}/20종 · ${escape(report.season)} · ${escape(report.updatedAt||'기준일 없음')}</p>
    <p>현재 모드의 공개 파티 표본 상위 20종 기준입니다. 상대 세팅은 항목별 통계 1위로 만든 가정이며 실전의 단일 세트를 뜻하지 않습니다. 상대 방어 특성·도구, 날씨·필드·랭크 등 미지원 효과는 제외됩니다.</p>
    ${report.checks.map(check=>`<details><summary>${escape(check.name)} · 표본 ${check.rate}% · ${check.complete?'계산됨':'자료 부족'}</summary>
      <div class="tablewrap"><table><thead><tr><th>내 포켓몬</th><th>주는 피해</th><th>받는 피해</th><th>스피드</th></tr></thead><tbody>
      ${check.members.map(member=>`<tr><td>${escape(member.name)}</td><td>${percent(member.attack)}</td><td>${percent(member.defense)}</td><td>내 ${member.speed??'—'} / 상대 ${member.opponentSpeeds?.map(speed=>`${escape(speed.label)} ${speed.value}`).join(' · ')||'자료 없음'}</td></tr>`).join('')}
      </tbody></table></div></details>`).join('')}
  </section>`;
}
