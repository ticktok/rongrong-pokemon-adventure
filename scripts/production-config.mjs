import { readFile,writeFile } from 'node:fs/promises';
const config=JSON.parse(await readFile('cloudbaserc.json','utf8'));
const secret=JSON.parse(await readFile('private/server.json','utf8'));
config.functions[0].envVariables={CLOUDBASE_APIKEY:secret.apiKey,NODE_ENV:'production'};
await writeFile('.cloudbaserc.production.local.json',JSON.stringify(config,null,2),{mode:0o600});
console.log('Prepared private deployment configuration.');
