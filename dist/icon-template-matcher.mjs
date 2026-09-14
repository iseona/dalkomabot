// Non-neural icon matching; no inference API and no usage/rank prior.
const SCALES = [[.32,.50],[.36,.62],[.40,.74],[.46,.66],[.42,.42],[.50,.50],[.60,.60],[.50,.80],[.58,.82],[.68,.92]];
export function prepareIconTemplates(image, makeCanvas) {
  return SCALES.map(([sx,sy]) => {
    const canvas=makeCanvas();canvas.width=canvas.height=32;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,16-16*sx,16-16*sy,32*sx,32*sy);
    const rgba=ctx.getImageData(0,0,32,32).data,points=[];
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const i=(y*32+x)*4;if(rgba[i+3]<220)continue;
      points.push(x,y,rgba[i],rgba[i+1],rgba[i+2]);
    }
    return new Float32Array(points);
  }).filter(points=>points.length>=60);
}

export function rankIconTemplates(pixels, references) {
  const candidates=references.map(reference=>{
    let best=Infinity;
    for(const points of reference.templates)for(const dy of [-3,0,3])for(const dx of [-3,0,3]){
      let difference=0,count=0;
      for(let i=0;i<points.length;i+=5){
        const x=points[i]+dx,y=points[i+1]+dy;
        if(x<0||x>=32||y<0||y>=32){difference+=3*255;count++;continue;}
        const p=(y*32+x)*4;
        difference+=Math.abs(pixels[p]-points[i+2])+Math.abs(pixels[p+1]-points[i+3])+Math.abs(pixels[p+2]-points[i+4]);count++;
      }
      best=Math.min(best,difference/(count*765));
    }
    return {name:reference.name,score:best};
  }).sort((a,b)=>a.score-b.score).slice(0,5);
  return {name:'',confidence:0,evidence:'template-candidate',candidates};
}
