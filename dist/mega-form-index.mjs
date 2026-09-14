import {resolveMegaForm} from './engine.mjs';

// Derived search/display rows.  Do not add these to source usage data: their
// usage, moves, and EVs belong to the base species, while types/stats/images
// are the resolved Mega form's own records.
export function buildMegaFormIndex(rows,master,imageMap={}){
 const forms=[];
 for(const base of rows||[]){
  for(const item of base.items||[]){
   const mega=resolveMegaForm(base,item.name,master);
   if(!mega.ok||forms.some(entry=>entry.name===mega.name))continue;
   forms.push({...base,name:mega.name,types:mega.types,items:[item],abilities:[],baseName:base.name,isMegaForm:true,megaStone:mega.item,image:imageMap[mega.name]||''});
  }
 }
 return forms.sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name,'ko'));
}

export function filterFormRows(baseRows,megaRows,filter){
 if(filter==='mega')return megaRows;
 if(filter==='normal')return baseRows;
 return [...baseRows,...megaRows];
}
