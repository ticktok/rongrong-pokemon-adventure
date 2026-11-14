// Uses only the isolated QA family. Formal and trial saves are read-only.
import {chromium,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadOps,settings} from './ops-lib.mjs';
const {BackupStore,restoreFamily,execute,initialState,validateSave}=await loadOps(),{envId,apiKey,version}=await settings(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json','utf8')),accounts=JSON.parse(await readFile('private/account-identities.json','utf8'));
assert.notEqual(families.qa,families.home);
const before=await store.snapshot(version,'manual'),original=before.saves.find(s=>s.family_id===families.qa);
assert(original&&!original.content_source_family_id);
await mkdir('private/backups',{recursive:true});await mkdir('artifacts',{recursive:true});
await writeFile('private/backups/parent-controls-qa-'+randomUUID()+'.json.gz',gzipSync(JSON.stringify(before)),{mode:0o600,flag:'wx'});await store.uploadVerified(before);
const base=process.env.TEST_URL??JSON.parse(await readFile('deployment.json','utf8')).url;
const publicKey=(await readFile('.env.local','utf8')).match(/^VITE_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');assert(publicKey);
const sdk=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`import cloudbase from '@cloudbase/js-sdk';window.__qaCloud=cloudbase.init(${JSON.stringify({env:envId,region:'ap-shanghai',accessKey:publicKey})});`},bundle:true,write:false,platform:'browser',format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={version,checks:[],errors:[],qaRestored:false,otherFamiliesUnchanged:false};
const pass=message=>{report.checks.push(message);console.log('PASS',message);};
const current=()=>store.currentFamily(families.qa);
async function commit(state){const row=await current();await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:row.revision,p_state:state,p_result:{message:'Isolated parent controls QA fixture'}});}
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
 let state=execute(initialState([],now,'测试训练师',''),{type:'starter',payload:{speciesId:25},operationId:randomUUID()},'child',rt).state;
 state.settings.weekdayPassDate=state.daily.date;
 state=execute(state,{type:'practice.start',payload:{},operationId:randomUUID()},'child',rt).state;
 await commit(state);const child=await login('child'),parent=await login('parent');
 await parent.getByRole('button',{name:'家庭规则',exact:true}).click();
 const initial=await current();for(let i=0;i<3;i++)assert((await command(child,'state.read')).ok);assert.equal((await current()).revision,initial.revision);
 assert.equal((await command(child,'parent.settings',{childLocked:true})).ok,false);
 await parent.getByLabel('道馆难度系数').fill('2');await parent.getByRole('button',{name:'保存难度',exact:true}).click();await expect(parent.getByRole('button',{name:'保存难度',exact:true})).toBeDisabled();await expect.poll(async()=>(await current()).state.settings.gymDifficulty,{timeout:15000}).toBe(2);
 await parent.getByRole('checkbox',{name:'锁定儿童端'}).click();await expect(parent.getByRole('checkbox',{name:'锁定儿童端'})).toBeChecked();await child.locator('.child-rest-page').waitFor();
 const locked=await current(),q=locked.state.question;
 for(const type of ['answer','world.position','reward.claim','parent.gym.retry']){const result=await command(child,type,{questionId:q.id,optionId:q.correctOptionId});assert.equal(result.ok,false);assert.equal(result.state.settings.childLocked,true);}
 assert.equal((await current()).revision,locked.revision);assert.deepEqual((await current()).state.question,q);
 await child.screenshot({path:'artifacts/parent-controls-live-rest.png'});await parent.screenshot({path:'artifacts/parent-controls-live-settings.png',fullPage:true});
 pass('Deployed parent UI saves difficulty and locks the live child; direct child writes are denied without changing save revision.');
 await child.reload();await child.locator('.child-rest-page').waitFor();assert.equal((await current()).revision,locked.revision);
 await parent.getByRole('checkbox',{name:'锁定儿童端'}).click();await expect(parent.getByRole('checkbox',{name:'锁定儿童端'})).not.toBeChecked();await child.locator('.quiz-options').waitFor();assert.equal((await current()).state.question.id,q.id);
 const answerId=randomUUID();const answer=await command(child,'answer',{questionId:q.id,optionId:q.correctOptionId},answerId);assert(answer.ok,answer.error);const revision=(await current()).revision;assert((await command(child,'answer',{questionId:q.id,optionId:q.correctOptionId},answerId)).ok);assert.equal((await current()).revision,revision);
 pass('Locked reload remains read-only; unlock resumes the same question and duplicate answer is applied once.');
 const battle=await command(child,'gym.start');assert(battle.ok,battle.error);assert.equal(battle.state.battle.gymDifficulty,2);const oldBattle=battle.state.battle;
 assert((await command(parent,'parent.settings',{gymDifficulty:.5})).ok);assert.deepEqual((await current()).state.battle,oldBattle);assert.equal((await command(parent,'parent.gym.retry')).ok,false);
 assert((await command(child,'battle.leave')).ok);await parent.reload();await parent.locator('.parent-page').waitFor();await parent.getByRole('button',{name:'家庭规则',exact:true}).click();
 const grant=parent.getByRole('button',{name:'今天再给一次挑战机会',exact:true});await expect(grant).toBeEnabled();await grant.click();await expect(grant).toBeDisabled();await expect.poll(async()=>(await current()).state.daily.gymExtraStarts,{timeout:15000}).toBe(1);
 const retryId=randomUUID();const extra=await command(child,'gym.start',{},retryId);assert(extra.ok,extra.error);assert.equal(extra.state.battle.gymDifficulty,.5);assert.equal(extra.state.daily.gymStarts,2);assert((await command(child,'gym.start',{},retryId)).ok);assert.equal((await current()).state.daily.gymStarts,2);
 assert((await command(child,'battle.leave')).ok);const grantId=randomUUID();assert((await command(parent,'parent.gym.retry',{},grantId)).ok);assert((await command(parent,'parent.gym.retry',{},grantId)).ok);assert.equal((await current()).state.daily.gymExtraStarts,2);
 validateSave((await current()).state);pass('Active gym retains its coefficient; parent grants exactly one retry and the next battle uses the new difficulty.');
 await parent.setViewportSize({width:1024,height:768});await parent.reload();await parent.locator('.parent-page').waitFor();await parent.getByRole('button',{name:'家庭规则',exact:true}).click();await parent.screenshot({path:'artifacts/parent-controls-live-ipad.png',fullPage:true});assert(await parent.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const path of ['assets/pokemon/art/1.png','assets/pokemon/back/25.png','manifest.webmanifest']){const response=await fetch(base+path);assert(response.ok);}
 assert.deepEqual(report.errors,[]);pass('Production assets and iPad-sized parent layout load without uncaught browser errors.');
}finally{
 for(const context of browser.contexts())for(const page of context.pages())await page.waitForLoadState('networkidle',{timeout:45000});
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);report.qaRestored=true;
 for(const row of before.saves.filter(s=>s.family_id!==families.qa)){const after=await store.currentFamily(row.family_id);assert.equal(after.revision,row.revision,'Another family changed concurrently; inspect before releasing');assert.deepEqual(after.state,row.state);}
 report.otherFamiliesUnchanged=true;await writeFile('artifacts/parent-controls-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; all other families unchanged.');
}
