function knownName(name, isKnown) {
  return typeof name === 'string' && isKnown(name) ? name : '';
}

// Only a separated, near-exact slot crop may bypass the model. A model's
// confidence number or a similar whole-screen background is not proof.
export function trustedLocalSlot(slot, isKnown) {
  return Boolean(knownName(slot?.name, isKnown) && slot?.evidence === 'slot-exact');
}

function mergeSlot(slot, visual = {}, isKnown) {
  const localName = knownName(visual.name, isKnown);
  const aiName = knownName(slot.name, isKnown);
  const conflict = localName && aiName && localName !== aiName;
  const aiTrusted = aiName && Number(slot.confidence) >= .8;
  const localTrusted = trustedLocalSlot(visual, isKnown);
  const name = conflict ? '' : localTrusted ? localName : aiTrusted ? aiName : '';
  return {
    ...slot,
    ...(!aiTrusted || conflict ? {item:'',ability:'',nature:'',moves:[],evs:Array(6).fill(null)} : {}),
    name,
    candidates: [...new Set([localName, aiName,
      ...(visual.candidates || []).map(candidate => candidate.name),
    ])].filter(candidate => knownName(candidate, isKnown)).slice(0, 5),
    confidence: name ? (localTrusted ? visual.confidence : slot.confidence) : 0,
    notes: [conflict ? '아이콘과 AI 결과가 달라 확인이 필요합니다.'
      : !name ? '확실하게 판별하지 못했습니다. 후보를 확인해 주세요.' : '',
      slot.notes].filter(Boolean).join(' '),
  };
}

export function mergePartyRecognition(aiSlots, localSlots, isKnown) {
  return aiSlots.map((slot, index) => mergeSlot(slot, localSlots[index], isKnown));
}

export function mergeLeadRecognition(aiSides, localSides, isKnown) {
  return Object.fromEntries(['mine', 'opp'].map(side => [
    side, aiSides[side].map((slot, index) => mergeSlot(slot, localSides[side][index], isKnown)),
  ]));
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
