export function megaStoneNames(master){
 return new Set((master?.items||[]).filter(item=>String(item?.[2]||'').includes('메가진화할 수 있게 되는 도구')).map(item=>item[0]));
}
export function megaItems(pokemon,master){const stones=megaStoneNames(master);return (pokemon?.items||[]).filter(item=>stones.has(item.name))}
export function hasMegaOption(pokemon,master){return megaItems(pokemon,master).length>0}
export function isMegaItem(item,master){return megaStoneNames(master).has(item||'')}
export function filterMegaPokemon(rows,filter,master){
 if(filter==='mega')return rows.filter(row=>hasMegaOption(row,master));
 if(filter==='normal')return rows.filter(row=>!hasMegaOption(row,master));
 return rows;
}
