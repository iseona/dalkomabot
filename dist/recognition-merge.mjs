function knownName(name, isKnown) {
  return typeof name === 'string' && isKnown(name) ? name : '';
}

// Only a separated, near-exact slot crop may bypass the model. A model's
// confidence number or a similar whole-screen background is not proof.
export function trustedLocalSlot(slot, isKnown) {
  return Boolean(knownName(slot?.name, isKnown) && slot?.evidence === 'slot-exact');
}

function mergeSlot(slot, visual = {}, isKnown, preserveText = false) {
  const localName = knownName(visual.name, isKnown);
  const aiName = knownName(slot.name, isKnown);
  const conflict = localName && aiName && localName !== aiName;
  const aiTrusted = aiName && Number(slot.confidence) >= .8;
  const localTrusted = trustedLocalSlot(visual, isKnown);
  const name = conflict ? '' : localTrusted ? localName : aiTrusted ? aiName : '';
  return {
    ...slot,
    ...(!preserveText && (!aiTrusted || conflict) ? {item:'',ability:'',nature:'',moves:[],evs:Array(6).fill(null)} : {}),
    name,
    candidates: [...new Set([localName, aiName,
      ...(slot.candidates || []).map(candidate=>typeof candidate==='string'?candidate:candidate.name),
      ...(visual.candidates || []).map(candidate => candidate.name),
    ])].filter(candidate => knownName(candidate, isKnown)).slice(0, 5),
    confidence: name ? (localTrusted ? visual.confidence : slot.confidence) : 0,
    notes: [conflict ? '아이콘과 AI 결과가 달라 확인이 필요합니다.'
      : !name ? '확실하게 판별하지 못했습니다. 후보를 확인해 주세요.' : '',
      slot.notes].filter(Boolean).join(' '),
  };
}

export function mergePartyRecognition(aiSlots, localSlots, isKnown) {
  // Species disagreement is not evidence that independently read text is absent.
  // Keep these values as an editable draft; the unresolved species still blocks apply.
  return aiSlots.map((slot, index) => mergeSlot(slot, localSlots[index], isKnown, true));
}

export function mergeLeadRecognition(aiSides, localSides, isKnown) {
  return Object.fromEntries(['mine', 'opp'].map(side => [
    side, aiSides[side].map((slot, index) => mergeSlot(slot, localSides[side][index], isKnown)),
  ]));
}

export function flagAmbiguousLeadForms(sides,localSides,pokemon) {
 const family=name=>{const ordinary=typeof name==='string'&&name.startsWith('메가')?name.slice(2).replace(/[XY]$/,''):name;return pokemon.find(row=>row[0]===ordinary)?.[1].split(' (')[0];};
 return Object.fromEntries(['mine','opp'].map(side=>[side,sides[side].map((slot,i)=>{
  const base=family(slot.name),forms=pokemon.filter(row=>family(row[0])===base).map(row=>row[0]);
  const evidence=localSides[side][i],localCandidates=(evidence?.candidates||[]).map(c=>typeof c==='string'?c:c.name);
  if(forms.length<2||trustedLocalSlot(evidence,name=>pokemon.some(row=>row[0]===name))||!localCandidates.some(name=>name!==slot.name&&forms.includes(name)))return slot;
  return {...slot,name:'',confidence:0,candidates:[...new Set([...localCandidates.filter(name=>forms.includes(name)),...forms])],notes:'기본 종명과 폼의 외형 판독이 일치하지 않습니다. 원본과 후보를 확인해 주세요.'};
 })]));
}

export function localLeadResult(local, isKnown) {
  if (!['mine', 'opp'].every(side => local?.sides?.[side]?.length === 6
    && local.sides[side].every(slot => trustedLocalSlot(slot, isKnown))
    && new Set(local.sides[side].map(slot => slot.name)).size === 6)) return null;
  return {schemaVersion: 1, kind: 'lead', slots: [], sides:
    Object.fromEntries(['mine', 'opp'].map(side => [side,
      local.sides[side].map((slot, index) => ({
        slot: index + 1, name: slot.name, item: '', ability: '', nature: '',
        moves: [], evs: Array(6).fill(null), confidence: slot.confidence, notes: '',
      })),
    ])),
  };
}
