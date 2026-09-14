import {readFile, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const data=JSON.parse(await readFile(path.join(root,'dist/data.json')));
const map=JSON.parse(await readFile(path.join(root,'dist/champions-image-map.json')));
const names=data.master.pokemon.map(p=>p[0]).sort();
const entries=[];
for(const name of names){
  const src=map[name];
  if(!src){entries.push({name,status:'missing'});continue;}
  const file=path.resolve(root,'dist',src);
  if(!file.startsWith(path.join(root,'dist','champions-images')+path.sep))throw Error('Unexpected asset source');
  const bytes=await readFile(file);
  if(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP')throw Error('Invalid WebP: '+src);
  entries.push({name,status:'available',src,bytes:(await stat(file)).size,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const report={source:'https://champs.pokedb.tokyo/',cachedSourceDirectory:'icons_512',
  sourceTerms:'https://champs.pokedb.tokyo/terms', bulkDownloadPerformed:true, purpose:'personal local use; not deployed',
  total:names.length,available:entries.filter(e=>e.status==='available').length,
  missing:entries.filter(e=>e.status==='missing').length,entries};
await writeFile(path.join(root,'reports/champions-image-inventory.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,available:report.available,missing:report.missing}));
