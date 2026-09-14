import assert from 'node:assert/strict';import {seasonStats} from '../dist/season-stats.mjs';
const base=[{rank:1,name:'한카리아스',types:['드래곤','땅'],items:[{name:'기합의띠',rate:50}],abilities:[],natures:[],evs:[],moves:[],teammates:[],counters:[]}],master=[['보만다','Salamence','드래곤/비행'],['한카리아스','Garchomp','드래곤/땅']];
const rows=seasonStats({baseRows:base,masterRows:master,ranking:[{rank:1,sourceId:'salamence'},{rank:2,sourceId:'garchomp'}],nameFor:item=>({salamence:'보만다',garchomp:'한카리아스'})[item.sourceId],settingsSeason:'M-4',selectedSeason:'M-6'});
assert.deepEqual(rows.map(row=>[row.rank,row.name]),[[1,'보만다'],[2,'한카리아스']]);assert.deepEqual(rows[0].types,['드래곤','비행']);assert.equal(rows[0].settingsAvailable,false);assert.deepEqual(rows[1].items,[]);
console.log('PASS: selected-season ranks drive rows without leaking stale settings.');
