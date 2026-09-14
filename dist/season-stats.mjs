export function seasonStats({baseRows,masterRows,ranking,nameFor,settingsSeason,selectedSeason,seasonSettings}){
 if(!Array.isArray(ranking)||!ranking.length)return baseRows
 const baseByName=new Map(baseRows.map(row=>[row.name,row])),masterByName=new Map(masterRows.map(row=>[row[0],row]))
 return ranking.map(item=>{
  const name=nameFor(item),base=baseByName.get(name),master=masterByName.get(name),snapshot=seasonSettings?.season===selectedSeason?seasonSettings.bySourceId?.[item.sourceId]:null,sameSeason=Boolean(snapshot)||selectedSeason===settingsSeason,details=snapshot||base
  if(!master)return null
  return {...(base||{}),rank:item.rank,name,types:(base?.types||String(master[2]).split('/')),items:sameSeason?(details?.items||[]):[],abilities:sameSeason?(details?.abilities||[]):[],natures:sameSeason?(details?.natures||[]):[],evs:sameSeason?(details?.evs||[]):[],moves:sameSeason?(details?.moves||[]):[],teammates:sameSeason?(details?.teammates||[]):[],counters:sameSeason?(details?.counters||[]):[],settingsAvailable:Boolean(sameSeason&&details),usageRank:true}
 }).filter(Boolean)
}

export function pokedexStats({masterRows,seasonRows}){
 const ranked=new Map((seasonRows||[]).map(row=>[row.name,row]))
 return (masterRows||[]).map(master=>{const current=ranked.get(master[0]);return {...(current||{}),rank:current?.rank??null,name:master[0],types:String(master[2]).split('/'),items:current?.items||[],abilities:current?.abilities||[],natures:current?.natures||[],evs:current?.evs||[],moves:current?.moves||[],teammates:current?.teammates||[],counters:current?.counters||[],settingsAvailable:Boolean(current?.settingsAvailable),isMegaForm:String(master[0]).startsWith('메가'),pokedex:true}})
}

export function pokedexDetails({master,row,abilities,typeMultiplier}){
 const types=String(master?.[2]||'').split('/').filter(Boolean),stats=(master||[]).slice(3,9).map(Number),allTypes=['노말','불꽃','물','전기','풀','얼음','격투','독','땅','비행','에스퍼','벌레','바위','고스트','드래곤','악','강철','페어리']
 const defense=allTypes.map(type=>[type,typeMultiplier(type,types)]),offense=allTypes.filter(target=>types.some(type=>typeMultiplier(type,[target])>1))
 return {height:null,weight:null,stats,total:stats.reduce((sum,value)=>sum+value,0),abilities:(row?.abilities||[]).map(value=>({name:value.name,description:(abilities||[]).find(item=>item[0]===value.name)?.[2]||null})),offense,weak:defense.filter(([,value])=>value>1),resist:defense.filter(([,value])=>value<1)}
}
