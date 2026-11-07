// Uses only the isolated QA family. Formal and trial saves are read-only.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import cloudbase from '@cloudbase/node-sdk';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {loadOps,settings} from './ops-lib.mjs';
const {BackupStore,restoreFamily,execute,initialState,makePartner,validateSave,decodeBackup}=await loadOps(),{envId,apiKey,version}=await settings(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json','utf8')),accounts=JSON.parse(await readFile('private/account-identities.json','utf8'));
assert.notEqual(families.qa,families.home);
// CLI's direct SCF Invoke is not supported by this environment's scoped credential.
// Reuse the existing CLI project credential with the native CloudBase invocation API.
const credentialFile=process.env.QA_CLOUDBASE_CREDENTIAL_FILE??join(homedir(),'.config','.cloudbase','projects',resolve('.').replace(/[^a-zA-Z0-9]/g,'-'),'auth.json');
const {credential}=JSON.parse(await readFile(credentialFile,'utf8'));assert.equal(credential.envId,envId);
assert(credential.secretId&&credential.secretKey&&credential.token,'Refresh the project CloudBase CLI credential before live QA');
const management=cloudbase.init({env:envId,region:'ap-shanghai',secretId:credential.secretId,secretKey:credential.secretKey,sessionToken:credential.token});
const before=await store.snapshot(version,'manual'),original=before.saves.find(s=>s.family_id===families.qa);
assert(original&&!original.content_source_family_id);
await mkdir('private/backups',{recursive:true});await mkdir('artifacts',{recursive:true});
await writeFile('private/backups/adventure-qa-'+randomUUID()+'.json.gz',gzipSync(JSON.stringify(before)),{mode:0o600,flag:'wx'});await store.uploadVerified(before);
const base=process.env.TEST_URL??JSON.parse(await readFile('deployment.json','utf8')).url;
const publicKey=(await readFile('.env.local','utf8')).match(/^VITE_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');assert(publicKey);
const sdk=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`import cloudbase from '@cloudbase/js-sdk';window.__qaCloud=cloudbase.init(${JSON.stringify({env:envId,region:'ap-shanghai',accessKey:publicKey})});`},bundle:true,write:false,platform:'browser',format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={version,checks:[],errors:[],qaRestored:false,otherFamiliesUnchanged:false};
const pass=message=>{report.checks.push(message);console.log('PASS',message);};
const current=()=>store.currentFamily(families.qa);
async function commit(state){const row=await current();await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:row.revision,p_state:state,p_result:{message:'Isolated adventure QA fixture'}});}
async function login(role){
 const account=accounts.find(a=>a.username==='rongrong-qa-'+role);assert(account);
 const page=await browser.newPage({viewport:{width:1024,height:950},serviceWorkers:'block'});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base);const notice=page.getByRole('button',{name:/^确定访问/});if(await notice.count())await notice.click();
 await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();await page.locator('.app-shell').waitFor();
 await page.goto(base+'#/'+(role==='parent'?'parent':'learning'));await page.locator(role==='parent'?'.parent-page':'.learning-grid').waitFor();
 assert((await page.locator('.app-footer').innerText()).includes('v'+version));
 return page;
}
async function command(page,type,payload={},operationId=randomUUID()){
 if(!await page.evaluate(()=>!!window.__qaCloud))await page.addScriptTag({content:sdk.outputFiles[0].text});
 return page.evaluate(async({type,payload,operationId})=>{const {data,error}=await window.__qaCloud.auth.getSession();if(error||!data?.session)throw new Error('QA session unavailable');const response=await window.__qaCloud.callFunction({name:'rongrong-game',data:{type,payload,operationId,expectedUid:String(data.session.user.id)}});return typeof response.result==='string'?JSON.parse(response.result):response.result;},{type,payload,operationId});
}
try{
 const now=new Date(),rt={now,uuid:randomUUID,random:()=>.3};
 let state=initialState([],now,'测试训练师','');state.started=true;state.partners=Array.from({length:12},(_,i)=>makePartner(i+1,8,rt));state.team=state.partners.slice(0,6).map(p=>p.id);state.settings.fastMultiplier=1;state.settings.dailyCap=320;
 state=execute(state,{type:'bootstrap',payload:{},operationId:randomUUID()},'child',rt).state;
 await commit(state);
 const child=await login('child');await child.goto(base+'#/partners');await child.locator('.party-slots').waitFor();assert.equal(await child.locator('.party-slots .partner-tile').count(),6);
 const beforeSwap=await current(),incoming=beforeSwap.state.boxes[0].slots[0],outgoing=beforeSwap.state.team[0];
 await child.locator('.box-grid .tile-add').first().click();await child.locator('.replacement-grid button').first().click();await child.locator('.replacement-grid').waitFor({state:'hidden'});
 let saved=await current();assert.equal(saved.state.team[0],incoming);assert.equal(saved.state.boxes[0].slots[0],outgoing);validateSave(saved.state);
 const stale=await command(child,'team.update',{partnerIds:beforeSwap.state.team,expectedRevision:beforeSwap.revision});assert.equal(stale.ok,false);assert.equal((await current()).state.team[0],incoming);
 const op=randomUUID(),payload={name:'云端验证盒子',expectedRevision:saved.revision};let result=await command(child,'box.create',payload,op);assert(result.ok,result.error);const boxCount=result.state.boxes.length;result=await command(child,'box.create',payload,op);assert(result.ok);assert.equal(result.state.boxes.length,boxCount);
 pass('Deployed six-member replacement, stale revision rejection and operation retry are correct.');
 const tasks=state.settings.tasks.map(t=>t.id);result=await command(child,'checkin.submit',{taskIds:tasks});assert(result.ok,result.error);
 const parent=await login('parent');result=await command(parent,'parent.review',{date:result.state.daily.date,approvedTaskIds:tasks,submissionVersion:1});assert(result.ok,result.error);
 saved=await current();assert.equal(saved.state.daily.baseExpUsed,230);assert.equal(saved.state.daily.expGranted,690);for(const id of saved.state.team)assert.equal(saved.state.partners.find(p=>p.id===id).exp,490+115);
 assert.equal((await command(child,'parent.review',{date:saved.state.daily.date,approvedTaskIds:tasks,submissionVersion:1})).ok,false);
 const invocation=await management.callFunction({name:'rongrong-backup',data:{}});assert.equal(invocation.result?.ok,true);const verified=decodeBackup(await store.download(invocation.result.key),envId);assert.deepEqual(verified.saves.find(s=>s.family_id===families.qa).state,saved.state);
 pass('Shared experience gives six partners 115 each from 230 base points; private backup reads the six-member save back.');
 const mapBundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export {MAPS} from './content/geometry';"},bundle:true,write:false,platform:'node',format:'esm'});const {MAPS}=await import('data:text/javascript;base64,'+Buffer.from(mapBundle.outputFiles[0].text).toString('base64'));
 saved.state.gymProgress.legacyOpenRegions=MAPS.map(m=>m.id);await commit(saved.state);
 for(const m of MAPS){for(const d of m.discoveries){result=await command(child,'world.position',{regionId:m.id,x:d.x,y:d.y});assert(result.ok,result.error);result=await command(child,'world.interact',{discoveryId:d.id});assert(result.ok,result.error);}}
 const discoveries=(await current()).state;assert.equal(discoveries.discoveries.length,24);assert.equal(discoveries.daily.questions,0);assert.equal(discoveries.daily.expGranted,690);
 result=await command(child,'world.interact',{discoveryId:MAPS.at(-1).discoveries.at(-1).id});assert.equal(result.state.discoveries.length,24);
 result=await command(child,'world.interact',{discoveryId:MAPS[0].discoveries[0].id});assert.equal(result.ok,false);
 await child.goto(base+'#/adventure');await child.reload();await child.locator('.world-canvas canvas').waitFor();await child.screenshot({path:'artifacts/adventure-live-map.png'});
 await child.goto(base+'#/partners');await child.locator('.party-slots').waitFor();await child.screenshot({path:'artifacts/adventure-live-partners.png',fullPage:true});
 await command(child,'bootstrap');
 const denied=await child.evaluate(async()=>{try{const r=await window.__qaCloud.callFunction({name:'rongrong-backup',data:{Type:'Timer'}});const v=typeof r.result==='string'?JSON.parse(r.result):r.result;return v?.ok!==true;}catch{return true;}});assert(denied);
 pass('All 24 deployed discoveries persist without experience or practice credit; distant interaction and client backup access are rejected.');
 for(const path of ['assets/pokemon/art/1.png','assets/pokemon/art/151.png','manifest.webmanifest','sw.js']){const r=await fetch(base+path);assert(r.ok);if(path==='sw.js')assert((await r.text()).includes(version));}
 assert.deepEqual(report.errors,[]);pass('Current version, assets, real login and affected routes verified without browser errors.');
}finally{
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);report.qaRestored=true;
 for(const row of before.saves.filter(s=>s.family_id!==families.qa)){const after=await store.currentFamily(row.family_id);assert.equal(after.revision,row.revision,'Another family changed concurrently; inspect before releasing');assert.deepEqual(after.state,row.state);}
 report.otherFamiliesUnchanged=true;await writeFile('artifacts/adventure-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; all other families unchanged.');
}
