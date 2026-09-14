import {resolveMegaForm} from './mega-classification.mjs';

// Champions additions verified against the live Champions dex before the source-data refresh lands.
const championsMegaForms={
 '한카리아스나이트Z':{baseName:'한카리아스',formName:'메가한카리아스Z',types:['드래곤'],baseStats:[108,130,95,80,85,102],formStats:[108,130,85,141,85,151],ability:'부유',source:'Serebii Pokémon Champions Pokédex'},
};

export function calculatorMegaOptions(pokemon,master){
 const regular=(pokemon?.items||[]).map(item=>item.name).filter(stone=>resolveMegaForm(pokemon,stone,master).ok);
 const supplemental=Object.entries(championsMegaForms).filter(([,form])=>form.baseName===pokemon?.name).map(([stone])=>stone);
 return [...new Set([...regular,...supplemental])];
}

export function resolveCalculatorMegaForm(pokemon,stone,master){
 const supplemental=championsMegaForms[stone];
 if(supplemental)return supplemental.baseName===pokemon?.name?{ok:true,stone,...supplemental}:{ok:false,reason:'선택한 스톤이 이 포켓몬과 대응하지 않습니다.'};
 return resolveMegaForm(pokemon,stone,master);
}
