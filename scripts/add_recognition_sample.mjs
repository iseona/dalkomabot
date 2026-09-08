#!/usr/bin/env node
/** Add icon-only references from a user-provided Champions team-selection screenshot. */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sharp=require('sharp');

const root=path.resolve(import.meta.dirname,'..');
const args=Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
if(!args.image||!args.mine||!args.opp)throw Error('usage: --image FILE --mine 이름,... --opp 이름,...');
const labels={mine:args.mine.split(','),opp:args.opp.split(',')};
if(labels.mine.length!==6||labels.opp.length!==6)throw Error('mine and opp must each contain six names');
const meta=await sharp(args.image).metadata(),outDir=path.join(root,'dist','recognition');
await fs.mkdir(outDir,{recursive:true});
const parseList=(value,fallback)=>value?value.split(',').map(Number):fallback,id=(args.id||'sample-20260908').replace(/[^a-zA-Z0-9_-]/g,'');
const rows=parseList(args.rows,[.176,.291,.405,.523,.641,.759]),left=parseList(args['left-box'],[.282,.354]),right=parseList(args['right-box'],[.748,.842]),boxes={mine:{x0:left[0],x1:left[1]},opp:{x0:right[0],x1:right[1]}},references=[];
if(rows.length!==6||left.length!==2||right.length!==2||[...rows,...left,...right].some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('normalized rows and boxes must be numbers between 0 and 1');
for(const side of ['mine','opp'])for(let i=0;i<6;i++){
  const box=boxes[side],left=Math.max(0,Math.round(meta.width*box.x0)),top=Math.max(0,Math.round(meta.height*(rows[i]-.061))),width=Math.min(meta.width-left,Math.round(meta.width*(box.x1-box.x0))),height=Math.min(meta.height-top,Math.round(meta.height*.122));
  const file=`${id}-${side}-${i+1}.webp`;
  await sharp(args.image).extract({left,top,width,height}).resize({width:128,height:128,fit:'fill'}).webp({quality:92}).toFile(path.join(outDir,file));
  references.push({name:labels[side][i],variant:'일반색 화면',side,src:`recognition/${file}`,transparent:false,source:'사용자 제공 챔피언스 화면'});
}
const dbPath=path.join(root,'dist','recognition-db.json');
let db={schemaVersion:2,updatedAt:new Date().toISOString().slice(0,10),references:[]};
try{db=JSON.parse(await fs.readFile(dbPath,'utf8'))}catch{}
db.schemaVersion=2;db.updatedAt=new Date().toISOString().slice(0,10);db.references=[...(db.references||[]).filter(r=>!r.src?.startsWith(`recognition/${id}-`)),...references];
await fs.writeFile(dbPath,JSON.stringify(db,null,2)+'\n');
console.log(`Added ${references.length} Champions UI references (${new Set(references.map(x=>x.name)).size} species)`);
