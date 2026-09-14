const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

async function encodeCanvas(canvas) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
  if (!blob) throw Error('이미지를 변환하지 못했습니다.');
  return dataUrl(blob);
}

function checkedFile(file) {
  if (!file || file.size > MAX_SOURCE_BYTES || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw Error('각 파일은 15MB 이하 PNG, JPG, WebP여야 합니다.');
  }
  return file;
}

export async function buildLeadContactSheet(file, rectDetector) {
  checkedFile(file);
  if (typeof rectDetector !== 'function') throw Error('선출 카드 위치 감지기가 필요합니다.');
  const bitmap = await createImageBitmap(file);
  try {
    const rects = {mine: rectDetector(bitmap, 'mine'), opp: rectDetector(bitmap, 'opp')};
    if (rects.mine.length !== 6 || rects.opp.length !== 6) {
      throw Error('선출 카드 12칸을 안정적으로 찾지 못했습니다.');
    }

    const cellWidth = 720;
    const cellHeight = 300;
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth * 2;
    canvas.height = cellHeight * 6;
    const context = canvas.getContext('2d');
    context.fillStyle = '#10151d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 30px sans-serif';
    context.textBaseline = 'top';

    for (const [column, side] of ['mine', 'opp'].entries()) {
      for (let index = 0; index < 6; index++) {
        const rect = rects[side][index];
        // Left cards need their label and icon. Opponent cards have no label,
        // so crop tightly enough for the icon to occupy most of the cell.
        const leftExtent = side === 'mine' ? 3.5 : 2.2;
        const rightExtent = side === 'mine' ? 1.2 : 2.2;
        const sx = Math.max(0, Math.floor(rect.x - rect.width * leftExtent));
        const centerY = rect.y + rect.height / 2;
        const cropHeight = rect.height * .78;
        const sy = Math.max(0, Math.floor(centerY - cropHeight / 2));
        const sw = Math.min(bitmap.width - sx, Math.ceil(rect.width * (1 + leftExtent + rightExtent)));
        const sh = Math.min(bitmap.height - sy, Math.ceil(cropHeight));
        const dx = column * cellWidth;
        const dy = index * cellHeight;
        context.drawImage(bitmap, sx, sy, sw, sh, dx, dy, cellWidth, cellHeight);
        context.fillStyle = 'rgba(0,0,0,.72)';
        context.fillRect(dx, dy, 84, 42);
        context.fillStyle = '#fff';
        context.fillText(`${side === 'mine' ? '좌' : '우'} ${index + 1}`, dx + 8, dy + 5);
      }
    }
    return {dataUrl: await encodeCanvas(canvas), width: canvas.width, height: canvas.height, rects};
  } finally {
    bitmap.close();
  }
}

export async function buildPartyContactSheet(files) {
  const bitmaps = [];
  try {
    for (const file of files) bitmaps.push(await createImageBitmap(checkedFile(file)));
    if (bitmaps.length > 2) throw Error('파티 상세 화면은 최대 2장까지 합칩니다.');
    const cellWidth = 800;
    const cellHeight = 240;
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth * bitmaps.length;
    canvas.height = cellHeight * 6;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f5f1e8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const centers = [
      [.292, .280], [.708, .280],
      [.292, .488], [.708, .488],
      [.292, .690], [.708, .690],
    ];
    for (let sourceIndex = 0; sourceIndex < bitmaps.length; sourceIndex++) {
      const bitmap = bitmaps[sourceIndex];
      for (let slot = 0; slot < centers.length; slot++) {
        const [centerX, centerY] = centers[slot];
        const sx = Math.max(0, Math.round(bitmap.width * (centerX - .205)));
        const sy = Math.max(0, Math.round(bitmap.height * (centerY - .09)));
        const sw = Math.min(bitmap.width - sx, Math.round(bitmap.width * .41));
        const sh = Math.min(bitmap.height - sy, Math.round(bitmap.height * .18));
        context.drawImage(bitmap, sx, sy, sw, sh, sourceIndex * cellWidth, slot * cellHeight, cellWidth, cellHeight);
        context.fillStyle = 'rgba(0,0,0,.72)';
        context.fillRect(sourceIndex * cellWidth, slot * cellHeight, 82, 38);
        context.fillStyle = '#fff';
        context.font = 'bold 26px sans-serif';
        context.fillText(`${slot + 1}`, sourceIndex * cellWidth + 10, slot * cellHeight + 5);
      }
    }
    return {dataUrl: await encodeCanvas(canvas), width: canvas.width, height: canvas.height};
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
  }
}
