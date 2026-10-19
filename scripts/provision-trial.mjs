import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {build} from 'esbuild';
import {settings,loadOps} from './ops-lib.mjs';
const {values}=parseArgs({options:{apply:{type:'boolean',default:false}}});
const {envId,apiKey}=await settings(),{BackupStore}=await loadOps(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json','utf8'));
const source=await store.currentFamily(families.home);
if(source.content_source_family_id)throw new Error('Source must be an independent family');
const file='private/trial-accounts.json';
function cli(args){
 let raw;
 try{raw=execFileSync(process.execPath,['node_modules/@cloudbase/cli/bin/tcb',...args,'--env-id',envId,'--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
 catch{throw new Error('CloudBase command failed: '+args.slice(0,2).join(' ')+'. Private credentials were not logged; inspect remote state before retrying.');}
 const value=JSON.parse(raw.slice(raw.indexOf('{')));
 if(value.error||value.data?.Error)throw new Error('CloudBase rejected '+args.slice(0,2).join(' '));
 return value;
}
function users(name){const response=cli(['user','list','--name',name]);if(!Array.isArray(response.data))throw new Error('Unexpected user list response');return response.data;}
let manifest;
try{manifest=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(manifest&&(manifest.envId!==envId||manifest.sourceFamilyId!==families.home||[families.home,families.qa].includes(manifest.familyId)))throw new Error('Trial manifest does not match this environment');
if(!manifest){
 const accounts=[];
 for(const role of ['child','parent']){
  const base='rongrong-trial-'+role;let username=base,index=1;
  while(users(username).length){username=base+'-'+(++index);if(index>20)throw new Error('No available trial username');}
  accounts.push({role,username,uid:randomUUID(),password:'Rr!'+randomBytes(18).toString('base64url')+'7a',created:false});
 }
 manifest={envId,sourceFamilyId:families.home,familyId:randomUUID(),accounts};
}
console.log(JSON.stringify({dryRun:!values.apply,accounts:manifest.accounts.map(a=>({username:a.username,role:a.role})),newFamily:true,source:'formal family content only',startsAtZero:true}));
if(!values.apply)process.exit(0);
await writeFile(file,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
for(const a of manifest.accounts){
 const existing=users(a.username);
 if(existing.length){
  if(existing.length!==1||(existing[0].uid??existing[0].Uid??existing[0].UserId)!==a.uid)throw new Error('User already exists with a different identity; no mapping changed');
 }else{
  cli(['user','create',a.username,'--uid',a.uid,'--password',a.password,'--nickname',a.role==='child'?'测试训练师':'测试家长']);
  const created=users(a.username);
  if(created.length!==1||(created[0].uid??created[0].Uid??created[0].UserId)!==a.uid)throw new Error('Created user identity could not be verified');
 }
 a.created=true;await writeFile(file,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
}
const built=await build({stdin:{contents:"export {initialState} from './server/state'; export {followContent} from './server/follow-content';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const {initialState,followContent}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const fresh=followContent(initialState([],new Date(),'测试训练师','测试账号'),source.state);
const quote=s=>"'"+String(s).replaceAll("'","''")+"'",family=quote(manifest.familyId),sourceId=quote(manifest.sourceFamilyId);
const inserts=manifest.accounts.map(a=>`INSERT INTO public.rr_members(uid,family_id,role) VALUES (${quote(a.uid)},${family},${quote(a.role)}) ON CONFLICT(uid) DO NOTHING;
IF NOT EXISTS(SELECT 1 FROM public.rr_members WHERE uid=${quote(a.uid)} AND family_id=${family} AND role=${quote(a.role)}) THEN RAISE EXCEPTION 'TRIAL_MEMBER_MISMATCH'; END IF;`).join('\n');
const sql=`DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.rr_saves WHERE family_id=${sourceId} AND content_source_family_id IS NULL) THEN RAISE EXCEPTION 'INVALID_CONTENT_SOURCE'; END IF;
INSERT INTO public.rr_saves(family_id,state,content_source_family_id) VALUES (${family},${quote(JSON.stringify(fresh))}::jsonb,${sourceId}) ON CONFLICT(family_id) DO NOTHING;
IF NOT EXISTS(SELECT 1 FROM public.rr_saves WHERE family_id=${family} AND content_source_family_id=${sourceId}) THEN RAISE EXCEPTION 'TRIAL_FAMILY_MISMATCH'; END IF;
${inserts}
END $$;`;
cli(['api','tcb','ExecutePGSql','--body',JSON.stringify({EnvId:envId,Sql:sql})]);
const saved=await store.currentFamily(manifest.familyId);
if(saved.content_source_family_id!==manifest.sourceFamilyId)throw new Error('Trial relation verification failed');
console.log('Trial family and both accounts verified. Credentials saved privately; existing progress was not reset.');
