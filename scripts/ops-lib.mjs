import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
export async function loadOps(){
 const result=await build({stdin:{contents:"export * from './server/backup'; export * from './server/save-validation'; export {wordBank} from './server/game-data'; export {execute} from './server/engine';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
export async function settings(){
 const [{envId},{version},{apiKey}]=await Promise.all(['cloudbaserc.json','package.json','private/server.json'].map(async path=>JSON.parse(await readFile(path,'utf8'))));
 return {envId,version,apiKey};
}
