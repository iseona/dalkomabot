import {detectedPartyCardRects,readPartyNatureArrows} from './recognition-contact-sheet.mjs';
import {matchRecognizedText,speciesFromStats,resolveStatReadings} from './recognition-text-validation.mjs';

function crop(bitmap,r,left,top,width,height,scale=2,threshold=190){
 const x=Math.floor(r.x+r.width*left),y=Math.floor(r.y+r.height*top);
 const w=Math.floor(r.x+r.width*(left+width))-x,h=Math.floor(r.y+r.height*(top+height))-y;
 const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(bitmap,x,y,w,h,0,0,w,h);
 const pixels=ctx.getImageData(0,0,w,h);for(let i=0;i<pixels.data.length;i+=4){const v=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]>threshold?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}ctx.putImageData(pixels,0,0);
 const out=document.createElement('canvas');out.width=w*scale+40;out.height=h*scale+40;const oc=out.getContext('2d');oc.fillStyle='#fff';oc.fillRect(0,0,out.width,out.height);oc.drawImage(c,20,20,w*scale,h*scale);return out.toDataURL('image/png');
}

export async function readLocalPartyText(files){
 const {master}=await(await fetch(new URL('./data.json',import.meta.url))).json();
 const {default:Tesseract}=await import('./vendor/party-text/tesseract.esm.min.js');
 const asset=name=>new URL('./vendor/party-text/'+name,import.meta.url).href;
 const worker=await Tesseract.createWorker(['kor','eng'],1,{workerPath:asset('worker.min.js'),corePath:asset('tesseract-core-lstm.wasm.js'),langPath:asset(''),gzip:false});
 const slots=Array.from({length:6},(_,i)=>({slot:i+1,moves:Array(4).fill(''),evs:Array(6).fill(null),stats:Array(6).fill(null),name:'',nature:'',observations:[]}));
 try{
  for(const file of files){const bitmap=await createImageBitmap(file);
   try{
    const rects=detectedPartyCardRects(bitmap),arrows=readPartyNatureArrows(bitmap),isStats=arrows.filter(Boolean).length>=3;
    await worker.reinitialize(isStats?'eng':'kor',1);
    for(let i=0;i<6;i++){
     const slot=slots[i],r=rects[i];
     if(isStats){
      const pair=arrows[i],nature=pair&&master.natures.find(n=>n[2]===pair.up&&n[3]===pair.down);slot.nature=nature?.[0]||'';
      for(let j=0;j<6;j++)for(const kind of ['stat','ev']){
       const col=Math.floor(j/3),row=j%3,left=kind==='stat'?(col?.75:.285):(col?.88:.425),width=kind==='stat'?.08:.055;
       const image=crop(bitmap,r,left,.30+row*.22,width,.20,3),values=[];
       for(const psm of kind==='ev'?['7','8']:['7']){await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'0123456789'});const {data}=await worker.recognize(image);const text=data.text.trim();if(/^\d{1,3}$/.test(text))values.push(Number(text));}
       const unique=[...new Set(values)];slot[kind==='stat'?'stats':'evs'][j]=unique.length===1?unique[0]:null;
      }
      const matches=speciesFromStats(master,slot.stats,slot.evs,nature);if(matches.length===1)slot.name=matches[0];
      if(!slot.name&&nature){
       const readings={stat:slot.stats.map(v=>v===null?[]:[v]),ev:slot.evs.map(v=>v===null?[]:[v])};
       for(let j=0;j<6;j++)for(const kind of ['stat','ev'])for(const threshold of [165,210]){
        const col=Math.floor(j/3),row=j%3,left=kind==='stat'?(col?.75:.285):(col?.88:.425),width=kind==='stat'?.08:.055;
        const image=crop(bitmap,r,left,.30+row*.22,width,.20,4,threshold);
        for(const psm of ['7','8']){await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'0123456789'});const {data}=await worker.recognize(image);if(/^\d{1,3}$/.test(data.text.trim()))readings[kind][j].push(Number(data.text.trim()));}
       }
       const resolved=resolveStatReadings(master,readings.stat,readings.ev,nature);slot.numericReadings=readings;if(resolved)Object.assign(slot,resolved);
      }
     }else{
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
      const fields=[['ability',.10,.27,.49,.19],['item',.15,.51,.44,.21],...Array.from({length:4},(_,m)=>['move'+m,.665,.095+m*.224,.29,.17])];
      for(const [field,x,y,w,h]of fields){
       const image=crop(bitmap,r,x,y,w,h),dictionary=master[field.startsWith('move')?'moves':field==='item'?'items':'abilities'].map(r=>r[0]);
       let {data}=await worker.recognize(image),match=matchRecognizedText(data.text.trim().split(/\s{2,}/)[0],dictionary);
       if(!match){for(const threshold of [165,210]){const retry=await worker.recognize(crop(bitmap,r,x,y,w,h,4,threshold));const alternative=matchRecognizedText(retry.data.text.trim().split(/\s{2,}/)[0],dictionary);slot.observations.push({field,attempt:'contrast-'+threshold,text:retry.data.text});if(alternative){data=retry.data;match=alternative;break;}}}
       if(!match){await worker.reinitialize(['kor','eng'],1);for(const psm of ['7','8']){await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:''});const retry=await worker.recognize(image);slot.observations.push({field,attempt:psm,text:retry.data.text});const alternative=matchRecognizedText(retry.data.text.trim().split(/\s{2,}/)[0],dictionary);if(alternative){data=retry.data;match=alternative;break;}}await worker.reinitialize('kor',1);await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});}
       if(!match&&field==='item'){
        const stem=data.text.trim(),variants=dictionary.filter(name=>name.slice(0,-1)===stem&&/[XY]$/.test(name));
        if(variants.length){
         const b=await createImageBitmap(await(await fetch(image)).blob()),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const cc=c.getContext('2d');cc.drawImage(b,0,0);b.close();const pixels=cc.getImageData(0,0,c.width,c.height).data,columns=[];
         for(let x=20;x<c.width-20;x++){let count=0;for(let y=20;y<c.height-20;y++)if(pixels[(y*c.width+x)*4]<128)count++;columns[x]=count;}
         let end=columns.length-1;while(end>20&&!columns[end])end--;let start=end;while(start>20&&columns[start-1])start--;
         if(end-start>=3){const glyph=document.createElement('canvas');glyph.width=end-start+41;glyph.height=c.height;const gc=glyph.getContext('2d');gc.fillStyle='#fff';gc.fillRect(0,0,glyph.width,glyph.height);gc.drawImage(c,start,0,end-start+1,c.height,20,0,end-start+1,c.height);await worker.reinitialize('eng',1);await worker.setParameters({tessedit_pageseg_mode:'10',tessedit_char_whitelist:'XY'});const tail=await worker.recognize(glyph.toDataURL('image/png'));const value=stem+tail.data.text.trim();if(variants.includes(value))match={name:value,exact:true,suffixEvidence:tail.data.text.trim()};await worker.reinitialize('kor',1);await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});}
        }
       }
       slot.observations.push({field,text:data.text,match,confidence:data.confidence});if(match){if(field.startsWith('move'))slot.moves[Number(field.slice(4))]=match.name;else slot[field]=match.name;}
      }
     }
    }
   }finally{bitmap.close();}
  }
  return slots;
 }finally{await worker.terminate();}
}

export function applyLocalPartyText(slots,local){
 return slots.map((slot,i)=>{
  const read=local[i];if(!read)return slot;
  return {...slot,...(read.name?{name:read.name,confidence:1,nameEvidence:'six-stat-equations'}:{}),
   item:read.item||slot.item,ability:read.ability||slot.ability,nature:read.nature||slot.nature,
   moves:slot.moves.map((move,j)=>read.moves[j]||move),evs:slot.evs.map((value,j)=>read.evs[j]??value),
   localTextEvidence:read.observations,observedStats:read.stats};
 });
}
