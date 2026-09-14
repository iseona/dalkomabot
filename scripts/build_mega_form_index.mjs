import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMegaFormIndex} from '../dist/mega-form-index.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'dist/data.json'),'utf8'));
const images=JSON.parse(fs.readFileSync(path.join(root,'dist/champions-image-map.json'),'utf8'));
const modes=Object.fromEntries(Object.entries(data.modes).map(([mode,rows])=>[mode,buildMegaFormIndex(rows,data.master,images)]));
fs.writeFileSync(path.join(root,'dist/mega-form-index.json'),JSON.stringify({schemaVersion:1,source:'data.json + resolveMegaForm',modes},null,2)+'\n');
console.log(`Built Mega form index: ${Object.values(modes).map(rows=>rows.length).join(' / ')} rows.`);
