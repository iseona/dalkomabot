export function seasonStats({baseRows,masterRows,ranking,nameFor,settingsSeason,selectedSeason}){
 if(!Array.isArray(ranking)||!ranking.length)return baseRows
 const baseByName=new Map(baseRows.map(row=>[row.name,row])),masterByName=new Map(masterRows.map(row=>[row[0],row]))
 return ranking.map(item=>{
  const name=nameFor(item),base=baseByName.get(name),master=masterByName.get(name),sameSeason=selectedSeason===settingsSeason
  if(!master)return null
  return {...(base||{}),rank:item.rank,name,types:(base?.types||String(master[2]).split('/')),items:sameSeason?(base?.items||[]):[],abilities:sameSeason?(base?.abilities||[]):[],natures:sameSeason?(base?.natures||[]):[],evs:sameSeason?(base?.evs||[]):[],moves:sameSeason?(base?.moves||[]):[],teammates:sameSeason?(base?.teammates||[]):[],counters:sameSeason?(base?.counters||[]):[],settingsAvailable:Boolean(sameSeason&&base),usageRank:true}
 }).filter(Boolean)
}
