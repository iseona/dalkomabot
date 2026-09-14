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
        const labelWidth=side==='mine'?440:0;
        if(labelWidth){const fit=Math.min(labelWidth/sw,(cellHeight-42)/sh);context.drawImage(bitmap,sx,sy,sw,sh,dx+(labelWidth-sw*fit)/2,dy+42+(cellHeight-42-sh*fit)/2,sw*fit,sh*fit);}
        const portraitWidth=cellWidth-labelWidth,fit=Math.min(portraitWidth/rect.width,(cellHeight-42)/rect.height);
        context.drawImage(bitmap,rect.x,rect.y,rect.width,rect.height,dx+labelWidth+(portraitWidth-rect.width*fit)/2,dy+42+(cellHeight-42-rect.height*fit)/2,rect.width*fit,rect.height*fit);
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

export function detectedPartyCardRects(bitmap) {
  // Locate card bodies from pixels, not screen-relative coordinates. This also
  // tolerates letterboxing, translated game windows and non-16:9 captures.
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const {width:w,height:h}=canvas,pixels=ctx.getImageData(0,0,w,h).data;
  const mask=new Uint8Array(w*h);
  for(let p=0;p<mask.length;p++){
    const i=p*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    mask[p]=r>55&&b>r*1.12&&b>g*1.12?1:0;
  }
  // Close small glyph/scanline holes, using a scale independent working image.
  for(let y=0;y<h;y++)for(let x=1;x<w-1;x++){
    if(mask[y*w+x])continue;
    let end=x;while(end<w&&!mask[y*w+end]&&end-x<5)end++;
    if(end<w&&mask[y*w+end]&&mask[y*w+x-1])for(let k=x;k<end;k++)mask[y*w+k]=1;
  }
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),components=[];
  for(let p=0;p<mask.length;p++){
    if(!mask[p]||seen[p])continue;
    let head=0,tail=1,x0=w,y0=h,x1=0,y1=0;queue[0]=p;seen[p]=1;
    while(head<tail){
      const q=queue[head++],x=q%w,y=Math.floor(q/w);
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const n of [x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1])
        if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}
    }
    const cw=x1-x0+1;
    // A portrait may touch the card and protrude above it. Only dense body
    // rows define the text layout; attached artwork must not shift all crops.
    const dense=[];
    for(let y=y0;y<=y1;y++){let count=0;for(let x=x0;x<=x1;x++)count+=mask[y*w+x];if(count>cw*.65)dense.push(y);}
    if(!dense.length)continue;
    y0=dense[0];y1=dense[dense.length-1];
    const ch=y1-y0+1,aspect=cw/ch;
    if(cw>=60&&ch>=15&&aspect>3&&aspect<5.5&&tail/(cw*ch)>.55)
      components.push({x:x0,y:y0,width:cw,height:ch});
  }
  // Require a coherent six-card grid; never silently substitute fixed crops.
  const groups=[];
  for(const seed of components){
    const peers=components.filter(c=>Math.abs(c.width/seed.width-1)<.12&&Math.abs(c.height/seed.height-1)<.18);
    if(peers.length!==6)continue;
    const sorted=[...peers].sort((a,b)=>a.y-b.y||a.x-b.x),rows=[];
    for(let i=0;i<6;i+=2)rows.push(sorted.slice(i,i+2).sort((a,b)=>a.x-b.x));
    const flat=rows.flat(),height=seed.height,width=seed.width;
    if(rows.some(r=>Math.abs(r[0].y-r[1].y)>height*.15||r[1].x-r[0].x<width*.9))continue;
    if(rows.some(r=>Math.abs(r[0].x-rows[0][0].x)>width*.08||Math.abs(r[1].x-rows[0][1].x)>width*.08))continue;
    if(rows.slice(1).some((r,i)=>r[0].y-rows[i][0].y<height*1.03||r[0].y-rows[i][0].y>height*1.8))continue;
    if(!groups.some(g=>g[0]===flat[0]))groups.push(flat);
  }
  if(groups.length!==1)throw Error('파티 카드 6칸의 전체 배열을 확인하지 못했습니다. 카드가 모두 보이는 원본을 넣어 주세요.');
  return groups[0].map(r=>{
    const px=r.width*.025,py=r.height*.05;
    const x=Math.max(0,Math.floor((r.x-px)/scale)),y=Math.max(0,Math.floor((r.y-py)/scale));
    return {x,y,width:Math.min(bitmap.width-x,Math.ceil((r.width+2*px)/scale)),height:Math.min(bitmap.height-y,Math.ceil((r.height+2*py)/scale))};
  });
}

export async function buildPartyContactSheet(files) {
  const bitmaps = [];
  try {
    for (const file of files) bitmaps.push(await createImageBitmap(checkedFile(file)));
    if (bitmaps.length > 2) throw Error('파티 상세 화면은 최대 2장까지 합칩니다.');
    const cellWidth = 1200;
    const cellHeight = 288;
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth * bitmaps.length;
    canvas.height = cellHeight * 6;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f5f1e8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceRects=[];
    for (let sourceIndex = 0; sourceIndex < bitmaps.length; sourceIndex++) {
      const bitmap = bitmaps[sourceIndex];
      const rects=detectedPartyCardRects(bitmap);sourceRects.push(rects);
      const isStats=readPartyNatureArrows(bitmap).filter(Boolean).length>=3;
      for (let slot = 0; slot < rects.length; slot++) {
        const rect=rects[slot];
        // Keep metadata and move text physically separate; the model otherwise
        // sometimes treats the first move as the held item.
        const dx=sourceIndex*cellWidth,dy=slot*cellHeight+32;
        context.drawImage(bitmap,rect.x,rect.y,rect.width*.60,rect.height,dx,dy,cellWidth*.60,cellHeight-32);
        for(let move=0;move<4;move++){
          const mx=dx+cellWidth*.60,my=dy+move*64;
          context.fillStyle='#fff';context.fillRect(mx,my,cellWidth*.40,64);
          context.fillStyle='#111';context.font='bold 16px sans-serif';context.textBaseline='top';
          context.fillText(`영역 ${move+1}`,mx+8,my+2);
          context.drawImage(bitmap,rect.x+rect.width*.60,rect.y+rect.height*move/4,rect.width*.40,rect.height/4,mx+70,my+12,cellWidth*.40-80,50);
        }
        if(isStats)context.drawImage(bitmap,rect.x,rect.y,rect.width,rect.height,dx,dy,cellWidth,cellHeight-32);
        context.fillStyle = '#10151d';
        context.fillRect(sourceIndex * cellWidth, slot * cellHeight, cellWidth, 32);
        context.fillStyle = '#fff';
        context.font = 'bold 22px sans-serif';
        context.textBaseline='top';
        context.fillText(`슬롯 ${slot + 1} · 화면 ${sourceIndex + 1}`, sourceIndex * cellWidth + 10, slot * cellHeight + 3);
      }
    }
    return {dataUrl: await encodeCanvas(canvas), width: canvas.width, height: canvas.height, sourceRects};
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
  }
}

export function readPartyNatureArrows(bitmap) {
 const rects=detectedPartyCardRects(bitmap),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
 const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
 return rects.map(rect=>{
  const hits={up:[],down:[]};
  for(const [col,stats]of [['left',['hp','atk','def']],['right',['spa','spd','spe']]])for(let row=0;row<3;row++){
   const x=rect.x+rect.width*(col==='left'?.17:.68),y=rect.y+rect.height*(.25+row*.235),w=rect.width*.12,h=rect.height*.20;
   const data=ctx.getImageData(Math.round(x),Math.round(y),Math.round(w),Math.round(h)).data;let up=0,down=0;
   for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(r>190&&r>g*1.24&&r>b*1.12)up++;if(g>180&&b>195&&r<g*.80)down++;}
   const minimum=Math.max(4,w*h*.003);
   if(up>minimum)hits.up.push(stats[row]);if(down>minimum)hits.down.push(stats[row]);
  }
  return hits.up.length===1&&hits.down.length===1&&hits.up[0]!==hits.down[0]&&!hits.up.includes('hp')&&!hits.down.includes('hp')?{up:hits.up[0],down:hits.down[0]}:null;
 });
}

export async function buildPartyCandidateLegend(slots,side='') {
  if(!Array.isArray(slots)||slots.length!==6)return null;
  const response=await fetch(new URL('./champions-image-map.json',import.meta.url));
  if(!response.ok)throw Error('외형 후보 이미지를 불러오지 못했습니다.');
  const mapping=await response.json(),canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1020;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#202630';ctx.fillRect(0,0,1000,1020);ctx.textBaseline='top';ctx.font='bold 20px sans-serif';ctx.fillStyle='#fff';ctx.fillText('외형 비교 후보 · 정답 아님 · 원본 초상화와 대조',12,8);
  for(let row=0;row<6;row++){
    const slot=slots[row]||{},names=[...new Set([slot.name,...(slot.candidates||[]).map(c=>typeof c==='string'?c:c.name)])].filter(name=>mapping[name]).slice(0,5);
    for(let col=0;col<names.length;col++){
      const name=names[col],image=await createImageBitmap(await(await fetch(new URL(mapping[name],import.meta.url))).blob());
      try{ctx.drawImage(image,col*200+48,row*160+40,104,104);}finally{image.close();}
      ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(`${side}${row+1}: ${name}`,col*200+5,row*160+145,190);
    }
  }
  return encodeCanvas(canvas);
}

// Species portraits extend above the purple card. Preserve that overhang and
// give them their own image budget instead of shrinking them with 84 text fields.
export async function buildPartyPortraitSheet(file) {
 checkedFile(file);
 const bitmap=await createImageBitmap(file);
 try {
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=900;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f1e8';ctx.fillRect(0,0,900,900);
  const rects=detectedPartyCardRects(bitmap);
  for(let slot=0;slot<6;slot++){
   const r=rects[slot],x=Math.max(0,r.x),y=Math.max(0,r.y-r.height*.20);
   const w=Math.min(bitmap.width-x,r.width*.15),h=Math.min(bitmap.height-y,r.height*.50);
   const dx=(slot%2)*450,dy=Math.floor(slot/2)*300,scale=Math.min(400/w,250/h);
   ctx.drawImage(bitmap,x,y,w,h,dx+(450-w*scale)/2,dy+40,w*scale,h*scale);
   ctx.fillStyle='#111';ctx.font='bold 24px sans-serif';ctx.fillText(`원본 초상화 · 슬롯 ${slot+1}`,dx+16,dy+30);
  }
  return encodeCanvas(canvas);
 }finally{bitmap.close();}
}

export async function buildPartyTextSheet(files) {
 for(const file of files){const bitmap=await createImageBitmap(file);
 try{
  if(readPartyNatureArrows(bitmap).filter(Boolean).length>=3)continue;
  const rects=detectedPartyCardRects(bitmap),canvas=document.createElement('canvas');canvas.width=2400;canvas.height=840;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const fields=[['특성',.10,.27,.46,.20],['도구',.10,.50,.47,.24],...Array.from({length:4},(_,i)=>[`기술 ${i+1}`,.64,.07+i*.235,.34,.205])];
  for(let row=0;row<6;row++)for(let col=0;col<6;col++){
   const [label,x,y,w,h]=fields[col],rect=rects[row],crop=document.createElement('canvas');crop.width=Math.round(rect.width*w);crop.height=Math.round(rect.height*h);
   const cc=crop.getContext('2d');cc.drawImage(bitmap,rect.x+rect.width*x,rect.y+rect.height*y,rect.width*w,rect.height*h,0,0,crop.width,crop.height);
   const pixels=cc.getImageData(0,0,crop.width,crop.height);for(let i=0;i<pixels.data.length;i+=4){const [r,g,b]=pixels.data.slice(i,i+3),v=Math.min(r,g,b)>185&&Math.max(r,g,b)-Math.min(r,g,b)<65?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}cc.putImageData(pixels,0,0);
   ctx.fillStyle='#111';ctx.font='bold 20px sans-serif';ctx.fillText(`슬롯 ${row+1} · ${label}`,col*400+10,row*140+24);
   const scale=Math.min(380/crop.width,100/crop.height);ctx.drawImage(crop,col*400+10,row*140+35,crop.width*scale,crop.height*scale);
  }
  return encodeCanvas(canvas);
 }finally{bitmap.close();}}
 return null;
}
