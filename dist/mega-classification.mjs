export function megaStoneNames(master){
 return new Set((master?.items||[]).filter(item=>String(item?.[2]||'').includes('메가진화할 수 있게 되는 도구')).map(item=>item[0]));
}
export function megaItems(pokemon,master){const stones=megaStoneNames(master);return (pokemon?.items||[]).filter(item=>stones.has(item.name))}
export function hasMegaOption(pokemon,master){return megaItems(pokemon,master).length>0}
export function isMegaItem(item,master){return megaStoneNames(master).has(item||'')}
export function resolveMegaForm(pokemon,stone,master){
 const item=master?.items?.find(row=>row[0]===stone),description=String(item?.[2]||''),baseMatch=description.match(/^(.+?)(?:이|가) 메가진화할 수 있게 되는 도구/);
 if(!item||!baseMatch||baseMatch[1]!==pokemon?.name)return {ok:false,reason:'선택한 스톤이 이 포켓몬과 대응하지 않습니다.'};
 const explicit=description.match(/\((메가[^)]+)\)\s*$/)?.[1],base=master.pokemon.find(row=>row[0]===pokemon.name),candidates=master.pokemon.filter(row=>row[1].startsWith(`${base?.[1]} (Mega `));
 const form=explicit?master.pokemon.find(row=>row[0]===explicit):candidates.length===1?candidates[0]:null;
 if(!form)return {ok:false,reason:candidates.length>1?'복수 메가폼의 정확한 대응이 아이템 설명에 없습니다.':'master에서 대응 메가폼을 확인할 수 없습니다.'};
 return {ok:true,stone,baseName:pokemon.name,formName:form[0],types:String(form[2]).split('/'),baseStats:base?.slice(3,9).map(Number),formStats:form.slice(3,9).map(Number),ability:null,abilityReason:'master에 메가폼 특성 연결 정보가 없어 특성 효과는 적용하지 않습니다.'};
}
export function filterMegaPokemon(rows,filter,master){
 if(filter==='mega')return rows.filter(row=>hasMegaOption(row,master));
 if(filter==='normal')return rows.filter(row=>!hasMegaOption(row,master));
 return rows;
}
