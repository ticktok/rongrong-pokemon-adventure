import {readFile} from 'node:fs/promises';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {loadOps,settings} from './ops-lib.mjs';
const {values}=parseArgs({options:{file:{type:'string'},key:{type:'string'},family:{type:'string'},revision:{type:'string'},apply:{type:'boolean',default:false},'dry-run':{type:'boolean',default:false}}});
if(!values.family||Number(!!values.file)+Number(!!values.key)!==1)throw new Error('Specify --family and exactly one --file or --key');
if(values.apply&&values['dry-run'])throw new Error('Choose --apply or --dry-run');
const {BackupStore,decodeBackup,restoreSelection,restoreFamily}=await loadOps(),{envId,version,apiKey}=await settings();
const store=new BackupStore(envId,apiKey),backup=decodeBackup(values.file?await readFile(values.file):await store.download(values.key),envId);
const current=await store.currentFamily(values.family),expected=values.revision===undefined?current.revision:Number(values.revision);
const desired=restoreSelection(backup,values.family,current,expected);
const changes=Object.keys({...current.state,...desired}).filter(key=>!isDeepStrictEqual(current.state[key],desired[key]));
console.log(JSON.stringify({mode:values.apply?'apply':'dry-run',envId,family:values.family,exportedAt:backup.exportedAt,currentRevision:current.revision,changedFields:changes},null,2));
if(values.apply){
 if(values.revision===undefined||!Number.isSafeInteger(expected))throw new Error('--apply requires the --revision returned by the dry run');
 console.log(JSON.stringify(await restoreFamily(store,backup,values.family,expected,version),null,2));
}
