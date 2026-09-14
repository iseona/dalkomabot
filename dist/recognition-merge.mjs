function knownName(name, isKnown) {
  return typeof name === 'string' && isKnown(name) ? name : '';
}

export function mergePartyRecognition(aiSlots, localSlots, isKnown) {
  return aiSlots.map((slot, index) => {
    const visual = localSlots[index] || {};
    const name = knownName(visual.name, isKnown) || knownName(slot.name, isKnown);
    return {
      ...slot,
      name,
      candidates: [...new Set([
        ...(visual.candidates || []).map(candidate => candidate.name),
        ...(name ? [name] : []),
      ])].filter(candidate => isKnown(candidate)).slice(0, 5),
      confidence: Math.max(slot.confidence || 0, visual.confidence || 0),
    };
  });
}

export function mergeLeadRecognition(aiSides, localSides, isKnown) {
  return Object.fromEntries(['mine', 'opp'].map(side => [side,
    aiSides[side].map((slot, index) => {
      const visual = localSides[side][index] || {};
      const name = knownName(visual.name, isKnown) || knownName(slot.name, isKnown);
      return {
        ...slot,
        name,
        candidates: [...new Set([
          ...(visual.candidates || []).map(candidate => candidate.name),
          ...(name ? [name] : []),
        ])].filter(candidate => isKnown(candidate)).slice(0, 5),
        confidence: Math.max(slot.confidence || 0, visual.confidence || 0),
        notes: [visual.reason, slot.notes].filter(Boolean).join(' '),
      };
    }),
  ]));
}
