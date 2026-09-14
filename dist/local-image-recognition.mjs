const PARTY_CENTERS = [
  [.119, .280], [.535, .280],
  [.119, .488], [.535, .488],
  [.119, .690], [.535, .690],
];

const LEAD_LAYOUTS = {
  compact: {leftX: .322, rightX: .810, firstY: .176, stepY: .113, size: .145},
  wide: {leftX: .323, rightX: .810, firstY: .202, stepY: .119, size: .135},
};

function squareRect(cx, cy, size, width, height) {
  const pixels = size * height;
  return {
    x: Math.round(cx * width - pixels / 2),
    y: Math.round(cy * height - pixels / 2),
    width: Math.round(pixels),
    height: Math.round(pixels),
  };
}

export function fixedSlotRects(kind, width, height) {
  if (kind === 'party') {
    return PARTY_CENTERS.map(([x, y]) => squareRect(x, y, .09, width, height));
  }
  if (kind !== 'lead') throw Error(`지원하지 않는 인식 화면입니다: ${kind}`);

  const layout = width / height < 2.2 ? LEAD_LAYOUTS.compact : LEAD_LAYOUTS.wide;
  const mine = [];
  const opp = [];
  for (let index = 0; index < 6; index++) {
    const y = layout.firstY + layout.stepY * index;
    mine.push(squareRect(layout.leftX, y, layout.size, width, height));
    opp.push(squareRect(layout.rightX, y, layout.size, width, height));
  }
  return {mine, opp};
}

function panelBands(image, side) {
  const width = 480;
  const height = Math.round(width * image.height / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const xStart = side === 'mine' ? 0 : Math.floor(width * .5);
  const xEnd = side === 'mine' ? Math.ceil(width * .5) : width;
  const scores = Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const offset = (y * width + x) * 4;
      const [red, green, blue] = pixels.slice(offset, offset + 3);
      const card = side === 'mine'
        ? blue > 95 && blue > green * 1.18 && blue > red * 1.05
        : red > 80 && red > green * 1.45 && red > blue * 1.03;
      if (card) scores[y]++;
    }
  }
  const peak = Math.max(...scores);
  const active = scores.map(score => score > Math.max(8, peak * .28));
  const raw = [];
  for (let y = 0; y < height;) {
    if (!active[y]) { y++; continue; }
    const start = y;
    while (y < height && active[y]) y++;
    if (y - start >= 4) raw.push([start, y - 1]);
  }
  const minimumCardHeight = height * .07;
  const candidates = raw.filter(([start, end]) => end - start + 1 >= minimumCardHeight);
  let best = null;
  for (let first = 0; first < candidates.length; first++) {
    for (let second = first + 1; second < candidates.length; second++) {
      const start = (candidates[first][0] + candidates[first][1]) / 2;
      const next = (candidates[second][0] + candidates[second][1]) / 2;
      const step = next - start;
      if (step < height * .08 || step > height * .16) continue;
      const matches = Array.from({length: 6}, (_, index) => {
        const expected = start + step * index;
        return candidates.find(band => Math.abs((band[0] + band[1]) / 2 - expected) < step * .24);
      });
      const score = matches.filter(Boolean).length;
      if (!best || score > best.score) best = {start, step, matches, score};
    }
  }
  const typicalHeight = best
    ? best.matches.filter(Boolean).map(([start, end]) => end - start + 1).sort((a, b) => a - b)[Math.floor(best.score / 2)]
    : 0;
  const bands = best && best.score >= 4
    ? Array.from({length: 6}, (_, index) => {
        const center = best.start + best.step * index;
        return [Math.round(center - typicalHeight / 2), Math.round(center + typicalHeight / 2)];
      })
    : candidates.slice(0, 6);
  return {
    bands,
    width,
    height,
    pixels,
  };
}

export function detectedLeadRects(image, side) {
  const scan = panelBands(image, side);
  // Both columns share row positions. The blue cards retain a clean fill even
  // when white opponent icons split the red-card color mask.
  const bands = panelBands(image, 'mine').bands;
  if (bands.length !== 6) return fixedSlotRects('lead', image.width, image.height)[side];
  const measured = bands.map(([top, bottom]) => {
    const centerY = (top + bottom) / 2;
    const columns = [];
    for (let x = side === 'mine' ? 0 : Math.floor(scan.width * .5); x < (side === 'mine' ? Math.ceil(scan.width * .5) : scan.width); x++) {
      let score = 0;
      for (let y = top; y <= bottom; y++) {
        const offset = (y * scan.width + x) * 4;
        const red = scan.pixels[offset], green = scan.pixels[offset + 1], blue = scan.pixels[offset + 2];
        if (side === 'mine' ? blue > 95 && blue > green * 1.18 && blue > red * 1.05 : red > 80 && red > green * 1.45 && red > blue * 1.03) score++;
      }
      if (score > (bottom - top) * .3) columns.push(x);
    }
    if (!columns.length) return null;
    const edge = side === 'mine' ? Math.max(...columns) : Math.min(...columns);
    const cardHeight = bottom - top + 1;
    const centerX = side === 'mine' ? edge - cardHeight * .45 : edge + cardHeight * .97;
    const scaleX = image.width / scan.width;
    const scaleY = image.height / scan.height;
    const size = cardHeight * scaleY * 1.5;
    return {centerX: centerX * scaleX, centerY: centerY * scaleY, size};
  }).filter(Boolean);
  if (measured.length !== 6) return fixedSlotRects('lead', image.width, image.height)[side];
  // Laser lines can extend a single card's color mask toward the middle. The
  // real icon column is the outermost stable column shared by all six cards.
  const iconCenterX = side === 'mine'
    ? Math.min(...measured.map(value => value.centerX))
    : Math.max(...measured.map(value => value.centerX));
  return measured.map(({centerY, size}) => ({
    x: iconCenterX - size / 2,
    y: centerY - size / 2,
    width: size,
    height: size,
  }));
}

export function cropRecognitionRect(image, rect, offsetX = 0, offsetY = 0, scale = 1) {
  const size = Math.round(rect.width * scale);
  const sourceX = Math.max(0, Math.round(rect.x + rect.width / 2 - size / 2 + offsetX));
  const sourceY = Math.max(0, Math.round(rect.y + rect.height / 2 - size / 2 + offsetY));
  const sourceWidth = Math.min(size, image.width - sourceX);
  const sourceHeight = Math.min(size, image.height - sourceY);
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  canvas.getContext('2d').drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error(`이미지를 읽지 못했습니다: ${source}`));
    image.src = source;
  });
}

export function imageSignature(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, 8, 8);
  const pixels = context.getImageData(0, 0, 8, 8).data;
  const signature = [];
  for (let index = 0; index < pixels.length; index += 4) {
    signature.push(pixels[index], pixels[index + 1], pixels[index + 2]);
  }
  return signature;
}

export async function loadOfficialIconReferences(iconMap) {
  return Promise.all(Object.entries(iconMap).map(async ([name, source]) => {
    const image = await loadImage(source);
    // The game stretches the 128 px source icon differently in compact lead
    // cards and party-detail cards, so preserve independent X/Y scales.
    const scales = [
      [.32, .50], [.36, .62], [.40, .74], [.46, .66],
      [.42, .42], [.50, .50], [.60, .60],
      [.50, .80], [.58, .82], [.68, .92],
    ];
    const templates = scales.map(([scaleX, scaleY]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const width = 64 * scaleX;
      const height = 64 * scaleY;
      canvas.getContext('2d').drawImage(
        image,
        (64 - width) / 2,
        (64 - height) / 2,
        width,
        height,
      );
      return canvas.getContext('2d').getImageData(0, 0, 64, 64).data;
    });
    return {
      name,
      source: '챔피언스 공식 아이콘',
      templates,
    };
  }));
}

export async function loadScreenIconReferences(entries) {
  return Promise.all(entries.map(async entry => {
    const image = await loadImage(entry.src);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext('2d').drawImage(image, 0, 0, 64, 64);
    return {
      ...entry,
      source: '검증된 게임 화면 아이콘',
      // Copy the pixel buffer so each reference owns stable storage. Some
      // browsers recycle canvas readback buffers when many images are loaded.
      screenTemplate: canvas.getContext('2d').getImageData(0, 0, 64, 64).data.slice(),
    };
  }));
}

function dominantBackground(screen) {
  const bins = new Map();
  for (let index = 0; index < screen.length; index += 4) {
    const key = `${screen[index] >> 4},${screen[index + 1] >> 4},${screen[index + 2] >> 4}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const [key] = [...bins].sort((left, right) => right[1] - left[1])[0];
  return key.split(',').map(value => Number(value) * 16 + 8);
}

function templateDistance(screen, background, template, dx, dy) {
  let product = 0;
  let sourceSquare = 0;
  let targetSquare = 0;
  for (let targetY = 0; targetY < 64; targetY++) {
    const sourceY = targetY - dy;
    for (let targetX = 0; targetX < 64; targetX++) {
      const sourceX = targetX - dx;
      const target = (targetY * 64 + targetX) * 4;
      const inSource = sourceX >= 0 && sourceX < 64 && sourceY >= 0 && sourceY < 64;
      const source = inSource ? (sourceY * 64 + sourceX) * 4 : 0;
      const alpha = inSource ? template[source + 3] / 255 : 0;
      for (let channel = 0; channel < 3; channel++) {
        const expected = alpha * (template[source + channel] - background[channel]);
        const actual = screen[target + channel] - background[channel];
        product += expected * actual;
        sourceSquare += expected * expected;
        targetSquare += actual * actual;
      }
    }
  }
  const divisor = Math.sqrt(sourceSquare * targetSquare);
  return divisor ? 1 - product / divisor : 1;
}

function outlineDistance(screen, template, dx, dy) {
  let difference = 0;
  let points = 0;
  for (let y = 0; y < 64; y++) {
    const targetY = y + dy;
    if (targetY < 0 || targetY >= 64) continue;
    for (let x = 0; x < 64; x++) {
      const targetX = x + dx;
      if (targetX < 0 || targetX >= 64) continue;
      const source = (y * 64 + x) * 4;
      if (template[source + 3] < 170) continue;
      const light = .299 * template[source] + .587 * template[source + 1] + .114 * template[source + 2];
      if (light > 105) continue;
      const target = (targetY * 64 + targetX) * 4;
      difference += (
        Math.abs(screen[target] - template[source])
        + Math.abs(screen[target + 1] - template[source + 1])
        + Math.abs(screen[target + 2] - template[source + 2])
      ) / (3 * 255);
      points++;
    }
  }
  return points >= 8 ? difference / points : 1;
}

function referenceDistance(screen, reference) {
  const background = dominantBackground(screen);
  if (reference.screenTemplate) {
    return {
      score: templateDistance(screen, background, reference.screenTemplate, 0, 0),
      colorScore: templateDistance(screen, background, reference.screenTemplate, 0, 0),
    };
  }
  let best = 1;
  let bestColor = 1;
  for (const template of reference.templates) {
    for (const dy of [-6, 0, 6]) {
      for (const dx of [-6, 0, 6]) {
        const color = templateDistance(screen, background, template, dx, dy);
        const outline = outlineDistance(screen, template, dx, dy);
        bestColor = Math.min(bestColor, color);
        best = Math.min(best, color * .35 + outline * .65);
      }
    }
  }
  return {score: best, colorScore: bestColor};
}

function recognitionPixels(image, rect) {
  const canvas = cropRecognitionRect(image, rect, 0, 0, 1);
  const small = document.createElement('canvas');
  small.width = 64;
  small.height = 64;
  small.getContext('2d').drawImage(canvas, 0, 0, 64, 64);
  return small.getContext('2d').getImageData(0, 0, 64, 64).data;
}

function recognizeRect(image, rect, references, preparedScreen = null) {
  const screen = preparedScreen || recognitionPixels(image, rect);
  const screenCandidates = references
    .filter(reference => reference.screenTemplate)
    .map(reference => ({
      name: reference.name,
      variant: reference.source,
      ...referenceDistance(screen, reference),
    }))
    .sort((left, right) => left.score - right.score);
  // A reviewed in-game crop is stronger evidence than a generic icon render.
  // Keep it ahead of the fallback ranking when the same runtime crop matches
  // almost pixel-for-pixel. This also avoids a generic icon suppressing an
  // exact regional/form match from a validated screenshot.
  const nearestOther = screenCandidates.find(candidate => candidate.name !== screenCandidates[0]?.name);
  const exactScreenMatch = screenCandidates[0]?.score < .04
    && (nearestOther?.score ?? 1) - screenCandidates[0].score > .04
    ? screenCandidates[0] : null;
  if (exactScreenMatch) {
    return {
      name: exactScreenMatch.name,
      evidence: 'slot-exact',
      confidence: Math.max(.95, 1 - exactScreenMatch.score),
      candidates: screenCandidates.slice(0, 5),
      reason: '',
    };
  }
  // Screen crops vary with capture resolution and compression. When none is
  // nearly identical, fall back to the resolution-independent official icon
  // matcher instead of treating a weak memorized crop as evidence.
  const all = references
    .filter(reference => !reference.screenTemplate)
    .map(reference => ({
      name: reference.name,
      variant: reference.source,
      ...referenceDistance(screen, reference),
    }))
    .sort((left, right) => left.score - right.score);
  if (!all.length) {
    return {
      name: '',
      confidence: 0,
      candidates: screenCandidates.slice(0, 5),
      reason: '공식 아이콘과 충분히 구분되는 일치 결과가 없습니다.',
    };
  }
  const colorRanking = [...all].sort((left, right) => left.colorScore - right.colorScore);
  const colorGap = (colorRanking[1]?.colorScore ?? 1) - colorRanking[0].colorScore;
  // Only this form has a reviewed fixture proving that its official icon is
  // distinguishable when the visible card label omits the regional prefix.
  // Other forms stay unresolved until equivalent evidence exists.
  const formOverride = colorRanking[0].name === '알로라 나인테일'
    && colorRanking[0].colorScore < .65
    && colorGap > .02
    ? colorRanking[0]
    : null;
  const ranking = (formOverride
    ? [formOverride, ...all.filter(candidate => candidate.name !== formOverride.name)]
    : all).slice(0, 5);
  const gap = (ranking[1]?.score ?? 1) - (ranking[0]?.score ?? 1);
  const certain = Boolean(formOverride) || gap > .02 && ranking[0]?.score < .30;
  return {
    name: certain ? ranking[0].name : '',
    confidence: certain ? Math.max(0, Math.min(1, gap / .12)) : 0,
    candidates: ranking,
    diagnostics: {
      screenCandidateCount: screenCandidates.length,
      bestScreen: screenCandidates[0] || null,
    },
    reason: certain ? '' : '공식 아이콘과 충분히 구분되는 일치 결과가 없습니다.',
  };
}

export function recognizeFixedLayout(image, kind, references) {
  let rects;
  if (kind === 'lead') {
    // Warm the browser's scaled canvas readback before measuring the panels.
    // The first read after decoding some PNG captures can produce a slightly
    // different red-card edge; the second read is stable and repeatable.
    detectedLeadRects(image, 'mine');
    detectedLeadRects(image, 'opp');
    rects = {mine: detectedLeadRects(image, 'mine'), opp: detectedLeadRects(image, 'opp')};
  } else {
    rects = fixedSlotRects(kind, image.width, image.height);
  }
  const signature = imageSignature(image);
  if (kind === 'party') {
    const usable = references.filter(reference => !reference.kind || reference.kind === kind);
    return {kind, slots: recognizeRects(image, rects, usable, signature)};
  }
  const referencesForSide = side => references.filter(reference => {
    if (reference.kind && reference.kind !== kind) return false;
    if (reference.side && reference.side !== side) return false;
    return true;
  });
  const mineReferences = referencesForSide('mine');
  const opponentReferences = referencesForSide('opp');
  return {
    kind,
    sides: {
      mine: recognizeRects(image, rects.mine, mineReferences, signature),
      opp: recognizeRects(image, rects.opp, opponentReferences, signature),
    },
  };
}

function recognizeRects(image, rects, references) {
  // Compare each actual slot against every reference for that side. Never
  // infer its species from the background or a fixture's saved slot number.
  const screenReferences = references.filter(reference => reference.screenTemplate);
  const officialReferences = references.filter(reference => !reference.screenTemplate);
  return rects.map(rect => {
    const pixels = recognitionPixels(image, rect);
    const exact = recognizeRect(image, rect, screenReferences, pixels);
    if (exact.evidence === 'slot-exact') return exact;
    const ranked = recognizeRect(image, rect, officialReferences, pixels);
    return {...ranked, name: '', confidence: 0,
      reason: '아이콘 후보를 찾았으나 자동 확정 기준에 미달했습니다.'};
  });
}

export async function recognizeFileLocally(file, kind, references) {
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    return recognizeFixedLayout(image, kind, references);
  } finally {
    URL.revokeObjectURL(source);
  }
}
