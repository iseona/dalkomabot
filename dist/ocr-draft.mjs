// Recognition drafts must never consult ranked/statistical sets.
export function selectOcrSpecies(draft, name) {
  return {...draft, name, fallback: [], moves: [...draft.moves], evs: [...draft.evs]};
}

export function applyEditedRecognitionText(draft, parsed) {
  const one = values => values?.length === 1 ? values[0] : '';
  return {...draft, ...parsed, fallback: [],
    items: one(parsed.matched?.items), abilities: one(parsed.matched?.abilities),
    natures: '', moves: [...(parsed.matched?.moves || [])].slice(0,4),
    evs: [...draft.evs]};
}

export function partySetFromRecognition(draft) {
  if (!Array.isArray(draft.evs) || draft.evs.length !== 6
    || draft.evs.some(value => !Number.isInteger(value) || value < 0 || value > 32)
    || draft.evs.reduce((sum,value) => sum+value,0) > 66)
    throw Error('능력 배분 여섯 값을 모두 확인해 주세요. 미인식 값은 0이나 통계값으로 채우지 않습니다.');
  return {name:draft.name, items:draft.items || '', abilities:draft.abilities || '',
    natures:draft.natures || '', moves:draft.moves.filter(Boolean).slice(0,4), evs:[...draft.evs]};
}
