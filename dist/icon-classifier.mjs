// Small learned image classifier. Scores are rankings, never probabilities.
export const FEATURE_SIZE = 817;
export function iconFeatures(rgba) {
  if (rgba.length !== 32 * 32 * 4) throw Error('Expected 32x32 RGBA');
  const out = new Float32Array(FEATURE_SIZE);
  // Spatial appearance plus a translation-tolerant colour histogram.
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        sum += rgba[((y * 2 + dy) * 32 + x * 2 + dx) * 4 + c];
      out[(y * 16 + x) * 3 + c] = sum / 510 - 1;
    }
  }
  for (let p = 0; p < 1024; p++) for (let c = 0; c < 3; c++)
    out[768 + c * 16 + (rgba[p * 4 + c] >> 4)] += 1 / 128;
  out[816] = 1;
  return out;
}

export function rankIcon(features, model, weights) {
  if (model.featureSize !== FEATURE_SIZE || weights.length !== model.names.length * FEATURE_SIZE)
    throw Error('Invalid local image model');
  const candidates = model.names.map((name, index) => {
    let score = 0;
    for (let j = 0; j < FEATURE_SIZE; j++) score += features[j] * weights[index * FEATURE_SIZE + j];
    return {name, score};
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  // No calibrated automatic confirmations with this small training corpus.
  return {name: '', confidence: 0, evidence: 'local-model-candidate', candidates,
    reason: '기기 내 모델의 후보입니다. 이름을 눌러 확인해 주세요.'};
}
