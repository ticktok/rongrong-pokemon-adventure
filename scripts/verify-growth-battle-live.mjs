// Live writes are restricted to the isolated QA family, backed up and restored in finally.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadOps,settings} from './ops-lib.mjs';
const {BackupStore,restoreFamily,execute,initialState,makePartner,validateSave}=await loadOps(),{envId,apiKey,version}=await settings(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json','utf8')),accounts=JSON.parse(await readFile('private/account-identities.json','utf8'));
assert(families.qa&&families.home&&families.qa!==families.home);
const before=await store.snapshot(version,'manual'),original=before.saves.find(s=>s.family_id===families.qa);assert(original&&!original.content_source_family_id);
await mkdir('private/backups',{recursive:true});await mkdir('artifacts',{recursive:true});
await writeFile('private/backups/presentation-qa-'+randomUUID()+'.json.gz',gzipSync(JSON.stringify(before)),{mode:0o600,flag:'wx'});await store.uploadVerified(before);
const base=process.env.TEST_URL??JSON.parse(await readFile('deployment.json','utf8')).url;
const publicKey=(await readFile('.env.local','utf8')).match(/^VITE_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');assert(publicKey);
const sdk=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`import cloudbase from '@cloudbase/js-sdk';window.__qaCloud=cloudbase.init(${JSON.stringify({env:envId,region:'ap-shanghai',accessKey:publicKey})});`},bundle:true,write:false,platform:'browser',format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true}),report={version,checks:[],errors:[],qaRestored:false,otherFamiliesUnchanged:false};
const current=()=>store.currentFamily(families.qa),pass=message=>{report.checks.push(message);console.log('PASS',message);};
async function commit(state){validateSave(state);const row=await current();await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:row.revision,p_state:state,p_result:{message:'Isolated presentation QA fixture'}});}
async function login(role){
 const account=accounts.find(a=>a.username==='rongrong-qa-'+role);assert(account);
 const page=await browser.newPage({viewport:{width:1024,height:900},serviceWorkers:'block'});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base);const notice=page.getByRole('button',{name:/^确定访问/});if(await notice.count())await notice.click();
 await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();await page.locator('.app-shell').waitFor();
 assert((await page.locator('.app-footer').innerText()).includes('v'+version));return page;
}
async function command(page,type,payload={},operationId=randomUUID()){
 if(!await page.evaluate(()=>!!window.__qaCloud))await page.addScriptTag({content:sdk.outputFiles[0].text});
 return page.evaluate(async({type,payload,operationId})=>{const {data,error}=await window.__qaCloud.auth.getSession();if(error||!data?.session)throw new Error('QA session unavailable');const response=await window.__qaCloud.callFunction({name:'rongrong-game',data:{type,payload,operationId,expectedUid:String(data.session.user.id)}});return typeof response.result==='string'?JSON.parse(response.result):response.result;},{type,payload,operationId});
}
try{
 const now=new Date(),rt={now,uuid:randomUUID,random:()=>.3};let state=initialState([],now,'测试训练师','');
 state.started=true;state.partners=[makePartner(4,15,rt),...[7,1,25,133,39].map(id=>makePartner(id,5,rt))];state.partners[0].exp=2200;state.team=state.partners.map(p=>p.id);state.settings.fastMultiplier=1;state.settings.weekdayPassDate=state.daily.date;
 state=execute(state,{type:'bootstrap',payload:{},operationId:randomUUID()},'child',rt).state;await commit(state);
 const child=await login('child'),parent=await login('parent'),tasks=state.settings.tasks.map(t=>t.id);
 let response=await command(child,'checkin.submit',{taskIds:tasks});assert(response.ok,response.error);
 response=await command(parent,'parent.review',{date:response.state.daily.date,approvedTaskIds:tasks,submissionVersion:1});assert(response.ok,response.error);assert.equal(response.state.growth.entries.length,6);
 await parent.reload();await parent.locator('.app-shell').waitFor();assert.equal(await parent.locator('.growth-dialog').count(),0);assert.equal((await current()).state.growth.readThrough,0);
 await child.reload();await child.locator('.growth-dialog').waitFor();assert.equal(await child.locator('.growth-card').count(),6);assert.match(await child.locator('.growth-dialog').innerText(),/115/);await child.screenshot({path:'artifacts/presentation-live-growth.png'});
 const device=await login('child');await device.locator('.growth-dialog').waitFor();await child.getByRole('button',{name:'知道啦',exact:true}).click();await child.locator('.growth-dialog').waitFor({state:'hidden'});
 await device.reload();await device.locator('.app-shell').waitFor();assert.equal(await device.locator('.growth-dialog').count(),0);
 const op=randomUUID();response=await command(child,'growth.ack',{through:6},op);assert(response.ok);const revision=response.state.revision;response=await command(child,'growth.ack',{through:6},op);assert.equal(response.state.revision,revision);
 assert.equal((await command(parent,'growth.ack',{through:6})).ok,false);
 pass('Deployed growth records offline parent rewards per partner; child acknowledgement syncs across devices, rejects parents and deduplicates retries.');
 await child.goto(base+'#/partners');await child.locator('.party-slots .partner-tile').first().click();child.once('dialog',d=>d.accept());await child.getByRole('button',{name:'进化为火恐龙',exact:false}).click();await child.getByRole('dialog',{name:'火恐龙',exact:true}).waitFor();await child.locator('.partner-detail .close').click();await child.locator('.growth-dialog').waitFor();assert.match(await child.locator('.growth-evolution').innerText(),/小火龙.*火恐龙/s);await child.getByRole('button',{name:'知道啦',exact:true}).click();await child.locator('.growth-dialog').waitFor({state:'hidden'});
 pass('Deployed manual evolution preserves the partner UUID and presents the before/after forms.');
 let saved=await current();state=saved.state;state.partners[0].moves=['fire-0','normal-0'];state=execute(state,{type:'encounter',payload:{},operationId:randomUUID()},'child',{...rt,now:new Date()}).state;
 Object.assign(state.battle,{enemy:10,enemies:[10],enemyLevel:5,enemyHp:500,enemyMaxHp:500});await commit(state);
 await child.goto(base+'#/adventure');await child.reload();await child.locator('.move-grid button').first().click();await child.locator('.quiz-options').waitFor();
 let q=(await current()).state.question;let index=q.options.findIndex(o=>o.id!==q.correctOptionId);await child.locator('.quiz-options button').nth(index).click();await child.locator('.word-explanation').waitFor();assert.equal(await child.locator('.skip-battle').count(),0);
 index=q.options.findIndex(o=>o.id===q.correctOptionId);await child.locator('.quiz-options button').nth(index).click();await child.locator('.move-caption').waitFor();assert.match(await child.locator('.move-caption').innerText(),/火花/);assert.equal(await child.locator('.move-grid button').first().isDisabled(),true);await child.waitForTimeout(400);await child.screenshot({path:'artifacts/presentation-live-battle.png'});await child.locator('.skip-battle').waitFor({state:'hidden'});assert.equal(await child.locator('.move-grid button').first().isDisabled(),false);
 await child.reload();await child.locator('.battle-panel').waitFor();assert.equal(await child.locator('.skip-battle').count(),0);
 response=await command(child,'battle.move',{moveId:'fire-0'});assert(response.ok);q=(await current()).state.question;const answerId=randomUUID();response=await command(child,'answer',{questionId:q.id,optionId:q.correctOptionId},answerId);assert(response.ok);assert.equal(response.result.battlePlayback.events[0].moveId,'fire-0');const battleRevision=response.state.revision;
 response=await command(child,'answer',{questionId:q.id,optionId:q.correctOptionId},answerId);assert(response.ok);assert.equal(response.state.revision,battleRevision);assert(!response.result.battlePlayback);
 pass('Deployed battle plays the actual move after correction, locks input through counterattack and never replays a settled turn on reload or retry.');
 validateSave((await current()).state);assert.deepEqual(report.errors,[]);
 for(const path of ['assets/pokemon/art/5.png','assets/pokemon/back/5.png','manifest.webmanifest','sw.js']){const r=await fetch(base+path);assert(r.ok);if(path==='sw.js')assert((await r.text()).includes(version));}
 pass('Current release assets, compatible QA save and affected browser flows verified without uncaught errors.');
}finally{
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);report.qaRestored=true;
 for(const row of before.saves.filter(s=>s.family_id!==families.qa)){const after=await store.currentFamily(row.family_id);assert.equal(after.revision,row.revision,'Another family changed concurrently; inspect before release');assert.deepEqual(after.state,row.state);}
 report.otherFamiliesUnchanged=true;await writeFile('artifacts/growth-battle-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; other families unchanged.');
}
