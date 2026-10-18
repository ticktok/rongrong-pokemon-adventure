import {readFile,writeFile,mkdir} from 'node:fs/promises';
const {apiKey}=JSON.parse(await readFile('private/server.json','utf8'));
const env=JSON.parse(await readFile('cloudbaserc.json','utf8')).envId;
const response=await fetch('https://'+env+'.api.tcloudbasegateway.com/v1/rdb/rest/rr_saves?select=*',{headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error('Backup failed: HTTP '+response.status);
const saves=await response.json();await mkdir('private/backups',{recursive:true});
const path='private/backups/saves-'+new Date().toISOString().replaceAll(':','-')+'.json';
await writeFile(path,JSON.stringify({exportedAt:new Date().toISOString(),env,saves},null,2),{mode:0o600});
console.log('Saved',saves.length,'family records to',path);
