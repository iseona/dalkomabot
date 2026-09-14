import {prepareIconTemplates, rankIconTemplates} from './icon-template-matcher.mjs';
let assets;
async function load() {
  if (!assets) assets = (async () => {
    const response=await fetch(new URL('./champions-icon-map.json',import.meta.url));
    if(!response.ok)throw Error('Local icon DB unavailable');
    const entries=Object.entries(await response.json()),references=[];
    // Bound startup requests; source files are local, browser-cacheable assets.
    for(let i=0;i<entries.length;i+=8)references.push(...await Promise.all(entries.slice(i,i+8).map(async([name,src])=>{
      const response=await fetch(new URL(src,import.meta.url));if(!response.ok)throw Error('Local icon missing');
      const image=await createImageBitmap(await response.blob());
      try{return {name,templates:prepareIconTemplates(image,()=>new OffscreenCanvas(32,32))};}
      finally{image.close();}
    })));
    return references;
  })();
  return assets;
}
self.onmessage = async ({data}) => {
  try {
    const references = await load();
    const results = data.pixels.map(pixels => rankIconTemplates(new Uint8ClampedArray(pixels), references));
    self.postMessage({id: data.id, results});
  } catch (error) { assets = null; self.postMessage({id: data.id, error: error.message}); }
};
