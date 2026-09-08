/** Pure parsing and fixed-layout preprocessing for Champions status screens. */
export function parseStats(text){
  const normalized=text.normalize('NFKC').replace(/[|]/g,' ');
  const expand=value=>{
    if(value.length>=4){
      for(const cut of [2,1]){
        const stat=Number(value.slice(0,-cut)),points=Number(value.slice(-cut));
        if(stat>=40&&stat<=500&&points<=32)return[stat,points];
      }
    }
    return[Number(value)];
  };
  const rows=normalized.split(/\n/).map(line=>{
    const numbers=(line.replace(/[—–_]+/g,' ').match(/\d{1,5}/g)||[]).flatMap(expand),pairs=[];
    for(let i=0;i<numbers.length-1;i++)if(numbers[i]>32&&numbers[i]<=500&&numbers[i+1]<=32){pairs.push([numbers[i],numbers[i+1]]);i++}
    return pairs.length>=2?[pairs[0],pairs.at(-1)]:null;
  }).filter(Boolean).slice(0,3);
  const layout=rows.length===3?[rows[0][0][1],rows[1][0][1],rows[2][0][1],rows[0][1][1],rows[1][1][1],rows[2][1][1]]:Array(6).fill(null);
  const labels=['(?:HP|ＨＰ)','(?<!특수)공격','(?<!특수)방어',String.raw`특수\s*공격`,String.raw`특수\s*방[어의]`,'스피[드르]'];
  return labels.map((label,index)=>{
    if(layout[index]!==null)return layout[index];
    const match=normalized.match(new RegExp(label+'[^0-9\\n]*([0-9]{1,3})[^0-9\\n]+([0-9]{1,2})(?![0-9])'));
    if(!match)return null;
    const points=Number(match[2]);
    return points<=32?points:null;
  });
}

export function selectStatValues(numberText,fullText,isValid){
  const numeric=parseStats(numberText),fallback=parseStats(fullText);
  return isValid(numeric)?numeric:fallback;
}

export function statNumberCrop(img,slot){
  const col=slot%2,row=Math.floor(slot/2);
  const cardX=(col?.514:.096)*img.width,cardY=(.202+row*.162)*img.height;
  const cardW=.392*img.width,cardH=.143*img.height;
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=240;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.filter='grayscale(1) contrast(1.8)';
  for(let line=0;line<3;line++){
    const sy=cardY+cardH*(.25+line*.24),sh=cardH*.22;
    ctx.drawImage(img,cardX+cardW*.28,sy,cardW*.22,sh,8,line*80+8,300,64);
    ctx.drawImage(img,cardX+cardW*.72,sy,cardW*.24,sh,328,line*80+8,304,64);
  }
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
  for(let i=0;i<data.length;i+=4){const luminance=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2],value=luminance>178?0:255;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255}
  ctx.putImageData(pixels,0,0);return canvas;
}

export function rgbHsv(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=(h*60+360)%360}return[h,max?d/max:0,max]}
function panelPixel(r,g,b,style){const laser=r>135&&b>105&&g<145&&r>g*1.18;if(laser)return true;if(style==='opp')return r>85&&r>g*1.32&&r>b*1.02;if(style==='mine')return b>80&&b>r*1.04&&b>g*1.08;return false}
function imageFeature(canvas,transparent=false,style=''){const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,corners=[[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]].map(([x,y])=>{const j=(y*canvas.width+x)*4;return[d[j],d[j+1],d[j+2]]}),bg=corners.reduce((a,v)=>a.map((x,i)=>x+v[i]/4),[0,0,0]),hue=Array(12).fill(0),sv=Array(16).fill(0),shape=Array(16).fill(0);let count=0,mr=0,mg=0,mb=0,minX=canvas.width,maxX=0,minY=canvas.height,maxY=0,cx=0,cy=0;for(let j=0;j<d.length;j+=4){if(d[j+3]<40)continue;const pixel=j/4,x=pixel%canvas.width,y=Math.floor(pixel/canvas.width),dist=Math.hypot(d[j]-bg[0],d[j+1]-bg[1],d[j+2]-bg[2]);if(!transparent&&(dist<52||panelPixel(d[j],d[j+1],d[j+2],style)))continue;const[h,s,v]=rgbHsv(d[j],d[j+1],d[j+2]);if(!transparent&&s<.12&&v>.82)continue;hue[Math.min(11,Math.floor(h/30))]+=Math.max(.15,s);sv[Math.min(3,Math.floor(s*4))*4+Math.min(3,Math.floor(v*4))]++;shape[Math.min(3,Math.floor(y/canvas.height*4))*4+Math.min(3,Math.floor(x/canvas.width*4))]++;mr+=d[j];mg+=d[j+1];mb+=d[j+2];cx+=x;cy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++}const norm=a=>{const z=Math.hypot(...a)||1;return a.map(x=>x/z)},geom=count?[(maxX-minX+1)/canvas.width,(maxY-minY+1)/canvas.height,cx/count/canvas.width,cy/count/canvas.height]:[0,0,0,0];return {hue:norm(hue),sv:norm(sv),shape:norm(shape),geom,rgb:count?[mr/count/255,mg/count/255,mb/count/255]:[0,0,0],area:count/(d.length/4)}}
function fineSilhouette(canvas,transparent=false,style=''){const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,corners=[[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]].map(([x,y])=>{const j=(y*canvas.width+x)*4;return[d[j],d[j+1],d[j+2]]}),bg=corners.reduce((a,v)=>a.map((x,i)=>x+v[i]/4),[0,0,0]),grid=Array(64).fill(0);for(let j=0;j<d.length;j+=4){if(d[j+3]<40)continue;const pixel=j/4,x=pixel%canvas.width,y=Math.floor(pixel/canvas.width),dist=Math.hypot(d[j]-bg[0],d[j+1]-bg[1],d[j+2]-bg[2]),[,s,v]=rgbHsv(d[j],d[j+1],d[j+2]);if(!transparent&&(dist<52||(s<.12&&v>.82)||panelPixel(d[j],d[j+1],d[j+2],style)))continue;grid[Math.min(7,Math.floor(y/canvas.height*8))*8+Math.min(7,Math.floor(x/canvas.width*8))]++}const z=Math.hypot(...grid)||1;return grid.map(x=>x/z)}
export function visualFeature(canvas,transparent=false,style=''){return {...imageFeature(canvas,transparent,style),fine:fineSilhouette(canvas,transparent,style)}}
function featureDistance(a,b){const cos=(x,y)=>1-x.reduce((n,v,i)=>n+v*y[i],0),color=Math.hypot(...a.rgb.map((v,i)=>v-b.rgb[i]))/Math.sqrt(3),geom=Math.hypot(...a.geom.map((v,i)=>v-b.geom[i]))/2;return cos(a.fine,b.fine)*.36+cos(a.shape,b.shape)*.24+geom*.18+cos(a.hue,b.hue)*.09+cos(a.sv,b.sv)*.07+color*.02+Math.abs(a.area-b.area)*.04}
export function validVisualFeature(f){return !!f&&Number.isFinite(f.area)&&f.area>0&&f.area<=1&&Object.entries({hue:12,sv:16,shape:16,geom:4,rgb:3,fine:64}).every(([key,length])=>Array.isArray(f[key])&&f[key].length===length&&f[key].every(v=>Number.isFinite(v)&&v>=0&&v<=1))}
export function compactFeature(f){const round=a=>a.map(v=>Math.round(v*100000)/100000);return {hue:round(f.hue),sv:round(f.sv),shape:round(f.shape),geom:round(f.geom),rgb:round(f.rgb),area:Math.round(f.area*100000)/100000,fine:round(f.fine)}}
export function rankVisualCandidates(features,refs,side=''){const usable=features.filter(validVisualFeature),best=new Map;if(!usable.length)return[];for(const ref of refs){if(!validVisualFeature(ref.feature))continue;const distances=usable.map(feature=>featureDistance(feature,ref.feature)).sort((a,b)=>a-b),style=ref.source==='사용자 확인'?.72:ref.source==='사용자 제공 화면'?.76:1,sidePenalty=ref.side&&side&&ref.side!==side?.035:0,value=(distances[0]*.78+(distances[1]??distances[0])*.22)*style+sidePenalty,old=best.get(ref.name);if(!old||value<old.score)best.set(ref.name,{name:ref.name,variant:ref.variant||ref.source,score:value})}return [...best.values()].filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score)}
export function confidentVisual(ranking){if(!ranking?.[1])return false;const first=ranking[0].score,second=ranking[1].score;return Number.isFinite(first)&&Number.isFinite(second)&&first>=0&&second>=first&&first<.24&&second-first>.018}
export function uniqueVisualRankings(rankings){const order=rankings.map((ranking,index)=>({index,gap:(ranking[1]?.score??9)-(ranking[0]?.score??9)})).sort((a,b)=>b.gap-a.gap),used=new Set,first=Array(rankings.length).fill('');for(const {index}of order){const pick=rankings[index].find(x=>!used.has(x.name));if(pick){first[index]=pick.name;used.add(pick.name)}}return rankings.map((ranking,index)=>[...ranking].sort((a,b)=>a.name===first[index]?-1:b.name===first[index]?1:a.score-b.score))}
export function panelLayout(img,side){const sample=document.createElement('canvas'),sw=420,sh=Math.round(sw*img.height/img.width);sample.width=sw;sample.height=sh;const ctx=sample.getContext('2d');ctx.drawImage(img,0,0,sw,sh);const d=ctx.getImageData(0,0,sw,sh).data,xmin=side==='mine'?.02:.52,xmax=side==='mine'?.49:.99,xd=Array(sw).fill(0),isPanel=(r,g,b)=>side==='mine'?b>r*1.08&&b>g*1.08&&b>85:r>g*1.35&&r>b*1.04&&r>75;for(let y=Math.floor(sh*.08);y<sh*.88;y++)for(let x=Math.floor(sw*xmin);x<sw*xmax;x++){const j=(y*sw+x)*4;if(isPanel(d[j],d[j+1],d[j+2]))xd[x]++}const smooth=a=>a.map((_,i)=>a.slice(Math.max(0,i-3),i+4).reduce((n,v)=>n+v,0)),xs=smooth(xd),peak=xs.indexOf(Math.max(...xs)),cut=xs[peak]*.22;let x0=peak,x1=peak;while(x0>sw*xmin&&xs[x0]>cut)x0--;while(x1<sw*xmax&&xs[x1]>cut)x1++;const ratio=img.width/img.height,spacing=Math.max(.086,Math.min(.117,ratio*.064)),center=ratio<1.5?.475:.49,rows=Array.from({length:6},(_,i)=>(center+(i-2.5)*spacing)*img.height);return{x0:x0/sw*img.width,x1:x1/sw*img.width,rows}}
