import {build} from 'esbuild';
import {writeFile,readFile} from 'node:fs/promises';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const sdk=JSON.parse(await readFile('node_modules/@cloudbase/node-sdk/package.json','utf8'));
for(const [name,entry,dependencies] of [['rongrong-game','server/index.ts',{'@cloudbase/node-sdk':sdk.version}],['rongrong-backup','server/backup-function.ts',{'@cloudbase/node-sdk':sdk.version}]]){
 await build({entryPoints:[entry],outfile:'cloudfunctions/'+name+'/index.js',bundle:true,platform:'node',target:'node20',format:'cjs',external:['@cloudbase/node-sdk'],sourcemap:false});
 await writeFile('cloudfunctions/'+name+'/package.json',JSON.stringify({name,version,main:'index.js',dependencies},null,2)+'\n');
}
const sw=await readFile('public/sw.js','utf8');
await writeFile('dist/sw.js',sw.replace('__APP_VERSION__',version));
