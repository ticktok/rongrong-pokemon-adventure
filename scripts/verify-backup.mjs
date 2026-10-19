import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {loadOps,settings} from './ops-lib.mjs';
const {values}=parseArgs({options:{file:{type:'string'},key:{type:'string'}}});
if(Number(!!values.file)+Number(!!values.key)!==1)throw new Error('Specify exactly one --file or --key');
const {BackupStore,decodeBackup}=await loadOps(),{envId,apiKey}=await settings();
const backup=decodeBackup(values.file?await readFile(values.file):await new BackupStore(envId,apiKey).download(values.key),envId);
console.log(JSON.stringify({verified:true,envId,exportedAt:backup.exportedAt,appVersion:backup.appVersion,families:backup.saves.length,operations:backup.operations.length},null,2));
