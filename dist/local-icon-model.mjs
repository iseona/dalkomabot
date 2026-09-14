import {detectedLeadRects, cropRecognitionRect, loadScreenIconReferences,
  recognizeFixedLayout} from './local-image-recognition.mjs';

let worker, sequence = 0, screens;
const pending = new Map();
function resetWorker() {
  worker?.terminate(); worker = null;
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('Local model interrupted')); }
  pending.clear();
}
function classify(pixels) {
  if (!worker) {
    worker = new Worker(new URL('./icon-classifier-worker.mjs', import.meta.url), {type: 'module'});
    worker.onerror = resetWorker;
    worker.onmessage = ({data}) => {
      const entry = pending.get(data.id); if (!entry) return;
      clearTimeout(entry.timer); pending.delete(data.id);
      data.error ? entry.reject(Error(data.error)) : entry.resolve(data.results);
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(resetWorker, 15000);
    pending.set(id, {resolve, reject, timer});
    worker.postMessage({id, pixels}, pixels);
  });
}
async function screenReferences() {
  if (!screens) screens = (async () => {
    const response = await fetch(new URL('./recognition-screen-map.json', import.meta.url));
    if (!response.ok) throw Error('Local references unavailable');
    const entries = await response.json();
    return loadScreenIconReferences(entries.filter(entry => entry.kind === 'lead').map(entry =>
      ({...entry, src: new URL(entry.src, import.meta.url).href})));
  })().catch(error => { screens = null; throw error; });
  return screens;
}

// No image or inference request leaves this device. Model assets are static GETs.
export async function recognizeLeadOnDevice(file, {references} = {}) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    let exact;
    try { exact = recognizeFixedLayout(image, 'lead', references ?? await screenReferences()); }
    catch { exact = {kind: 'lead', sides: {mine: Array.from({length: 6}, () => ({})), opp: Array.from({length: 6}, () => ({}))}}; }
    const pixels = [], crops = [];
    for (const side of ['mine', 'opp']) for (const rect of detectedLeadRects(image, side)) {
      const crop = cropRecognitionRect(image, rect);
      crops.push(crop.toDataURL('image/webp', .85));
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.drawImage(crop, 0, 0, 32, 32);
      pixels.push(ctx.getImageData(0, 0, 32, 32).data.buffer);
    }
    let ranked, warning = '';
    try { ranked = await classify(pixels); }
    catch { ranked = pixels.map(() => ({name: '', confidence: 0, candidates: []})); warning = '로컬 이미지 DB를 불러오지 못했습니다. 검색으로 확인하거나 AI 보조 인식을 선택하세요.'; }
    return {kind: 'lead', warning, sides: Object.fromEntries(['mine', 'opp'].map((side, si) => [side,
      exact.sides[side].map((slot, i) => ({...(slot.evidence === 'slot-exact' ? slot : ranked[si * 6 + i]), crop: crops[si * 6 + i]})),
    ]))};
  } finally { URL.revokeObjectURL(url); }
}
