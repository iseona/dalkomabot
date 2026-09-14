export function normalizePokemonText(value){return String(value??'').normalize('NFKC').replace(/\s/g,'')}

export function findPokemonMatches(rows,query,limit=12){
 const raw=String(query??'').normalize('NFKC').trim();
 if(!raw)return [];
 const joined=normalizePokemonText(raw).replace(/(리전)?폼/g,'');
 const regions=['알로라','가라르','히스이','팔데아'].filter(region=>joined.includes(region));
 const base=regions.reduce((name,region)=>name.replace(region,''),joined);
 const words=raw.split(/\s+/).map(word=>normalizePokemonText(word.replace(/(리전)?폼$/,'')));
 const terms=[...new Set([...words,...regions,base].filter(Boolean))];
 return rows.filter(row=>terms.every(term=>normalizePokemonText(row.name).includes(term))).sort((left,right)=>{
  const a=normalizePokemonText(left.name),b=normalizePokemonText(right.name);
  return Number(b===joined)-Number(a===joined)||Number(b===base)-Number(a===base)||left.rank-right.rank;
 }).slice(0,limit);
}
