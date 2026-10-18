import { build } from 'esbuild';
import { writeFile,readFile } from 'node:fs/promises';
await build({entryPoints:['server/index.ts'],outfile:'cloudfunctions/rongrong-game/index.js',bundle:true,platform:'node',target:'node20',format:'cjs',external:['@cloudbase/node-sdk'],sourcemap:false});
const sdk=JSON.parse(await readFile('node_modules/@cloudbase/node-sdk/package.json','utf8'));
await writeFile('cloudfunctions/rongrong-game/package.json',JSON.stringify({name:'rongrong-game',version:'0.1.0',main:'index.js',dependencies:{'@cloudbase/node-sdk':sdk.version}},null,2));
