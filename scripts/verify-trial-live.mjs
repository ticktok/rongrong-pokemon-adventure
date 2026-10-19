// Explicit first-delivery acceptance only. Always backs up and restores QA + trial; never writes home.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {loadOps,settings} from './ops-lib.mjs';
const {envId,version,apiKey}=await settings(),{BackupStore,restoreFamily}=await loadOps();
const store=new BackupStore(envId,apiKey),manifest=JSON.parse(await readFile('private/trial-accounts.json','utf8'));
const families=JSON.parse(await readFile('private/family-seed.json','utf8'));
assert.equal(manifest.envId,envId);assert.equal(manifest.sourceFamilyId,families.home);
assert.equal(new Set([families.home,families.qa,manifest.familyId]).size,3);
const initial=await store.snapshot(version,'manual'),beforeHome=initial.saves.find(s=>s.family_id===families.home);
const initialTrial=initial.saves.find(s=>s.family_id===manifest.familyId);
assert(initialTrial&&!initialTrial.state.started,'This acceptance script is only for a new, unplayed trial account');
await mkdir('private/backups',{recursive:true});
const backupFile='private/backups/trial-acceptance-'+new Date().toISOString().replaceAll(':','-')+'.json.gz';
await writeFile(backupFile,gzipSync(JSON.stringify(initial)),{mode:0o600,flag:'wx'});await store.uploadVerified(initial);
const root='https://'+envId+'.api.tcloudbasegateway.com/v1/rdb/rest/';
async function pg(path,method='GET',body){const r=await fetch(root+path,{method,headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error('PG acceptance request failed '+r.status);return r.status===204?null:r.json();}
async function sourceLink(id){await pg('rr_saves?family_id=eq.'+manifest.familyId,'PATCH',{content_source_family_id:id});assert.equal((await store.currentFamily(manifest.familyId)).content_source_family_id,id);}
async function commit(family,state){const saved=await store.currentFamily(family);await store.rpc('rr_commit',{p_family:family,p_operation:randomUUID(),p_revision:saved.revision,p_state:state,p_result:{message:'Isolated trial acceptance fixture'}});}
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5173/';
const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
async function login(role){const a=manifest.accounts.find(a=>a.role===role);await page.getByLabel('账号',{exact:true}).fill(a.username);await page.getByLabel('密码',{exact:true}).fill(a.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();await page.locator('.trial-banner,.form-error,.loading-screen .error-text').first().waitFor();const errors=await page.locator('.form-error,.loading-screen .error-text').allTextContents();assert.deepEqual(errors,[]);await page.locator('.trial-banner').waitFor();await page.waitForFunction(()=>!document.querySelector('.cloud-state .spin'));}
async function command(type,payload={},operationId=randomUUID()){return page.evaluate(async({type,payload,operationId})=>(await import('/src/lib.ts')).request({type,payload,operationId}),{type,payload,operationId});}
try{
 await sourceLink(families.qa);
 await page.goto(base,{waitUntil:'networkidle'});await login('child');
 let result=await command('bootstrap');assert.equal(result.ok,true);assert.equal(result.state.contentMode,'follow');assert.equal(result.state.started,false);pass('Trial child login with independent zero progress');
 await page.getByRole('button',{name:'就决定是你了，皮卡丘！',exact:true}).click();await page.locator('.world-canvas canvas').waitFor();
 result=await command('practice.start',{mode:'daily'});assert.equal(result.ok,true,result.error);
 let own=await store.currentFamily(manifest.familyId);const question=structuredClone(own.state.question),partners=structuredClone(own.state.partners);
 const qa=await store.currentFamily(families.qa);qa.state.settings.baseExp=300;qa.state.settings.dailyCap=1500;
 qa.state.npcs[0].line='测试内容跟随验证';
 qa.state.customWords=qa.state.customWords.filter(w=>w.id!==question.wordId);
 qa.state.customWords.push({id:question.wordId,word:question.word,meaning:'测试更新释义',topic:'测试同步',level:1,example:'A new example.'});
 await commit(families.qa,qa.state);const sourceAfter=await store.currentFamily(families.qa);
 result=await command('bootstrap');assert.equal(result.ok,true,result.error);assert.equal(result.state.settings.baseExp,300);assert.equal(result.state.npcs[0].line,'测试内容跟随验证');assert.deepEqual(result.state.partners,partners);
 own=await store.currentFamily(manifest.familyId);assert.deepEqual(own.state.question,question);pass('Live source configuration updates preserve partners and the existing question');
 result=await command('answer',{questionId:question.id,optionId:question.correctOptionId});assert.equal(result.ok,true,result.error);assert.equal(result.state.daily.questions,1);
 const task=result.state.settings.tasks.find(t=>t.active);assert(task);
 result=await command('checkin.submit',{taskIds:[task.id]});assert.equal(result.ok,true,result.error);
 result=await command('parent.review',{date:result.state.today,approve:true});assert.equal(result.ok,false);
 result=await command('bootstrap',{familyId:families.home,content_source_family_id:families.home,role:'parent'});assert.equal(result.state.contentMode,'follow');assert.equal(result.state.role,'child');assert.equal(result.state.nickname,'测试训练师');pass('Child cannot approve or choose another family');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'退出账号',exact:true}).click();await page.getByLabel('账号',{exact:true}).waitFor();await login('parent');
 await page.getByRole('button',{name:'家长',exact:true}).waitFor();await page.getByRole('button',{name:'家长',exact:true}).click();await page.locator('.review-card').waitFor();
 const approveId=randomUUID();result=await command('parent.review',{date:own.state.daily.date,approve:true},approveId);assert.equal(result.ok,true,result.error);const awarded=await store.currentFamily(manifest.familyId);
 assert(awarded.state.partners[0].exp>partners[0].exp);result=await command('parent.review',{date:own.state.daily.date,approve:true},approveId);assert.equal(result.state.revision,awarded.revision);pass('Trial parent review awards experience once; logout/login switch preserves identity');
 for(const type of ['parent.settings','parent.tasks','parent.words','parent.word.disable','parent.npc']){result=await command(type,{baseExp:999,role:'parent',familyId:families.home});assert.equal(result.ok,false);assert.match(result.error,/只能查看/);}
 const mismatch=await page.evaluate(async expectedUid=>{const {cloud}=await import('/src/lib.ts');return cloud.callFunction({name:'rongrong-game',data:{type:'bootstrap',operationId:crypto.randomUUID(),payload:{},expectedUid}});},manifest.accounts.find(a=>a.role==='child').uid);
 const mismatchResult=typeof mismatch.result==='string'?JSON.parse(mismatch.result):mismatch.result;assert.equal(mismatchResult.ok,false);pass('All content writes and a request bound to another UID are rejected');
 const rows=await page.evaluate(async()=>{const {cloud}=await import('/src/lib.ts');const r=await cloud.rdb().from('rr_saves').select('family_id');return {error:!!r.error,count:r.data?.length??0};});assert(rows.error||rows.count===0);pass('Trial browser cannot directly read database families');
 result=await command('parent.export');assert.equal(result.ok,true);assert.equal(result.export.nickname,'测试训练师');assert.equal(JSON.stringify(result).includes(families.home),false);
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'家庭规则',exact:true}).click();assert(await page.getByRole('button',{name:'保存家庭规则'}).isDisabled());
 await page.getByRole('button',{name:'英语词库',exact:true}).click();assert(await page.getByRole('button',{name:'添加单词'}).isDisabled());await page.getByPlaceholder('搜索单词或词义').fill('apple');
 assert.deepEqual(await store.currentFamily(families.qa),sourceAfter);assert.deepEqual(await store.currentFamily(families.home),beforeHome);assert.deepEqual(errors,[]);pass('Read-only parent UI and export; trial gameplay leaves source and formal saves unchanged');
}finally{
 await browser.close();
 const currentQa=await store.currentFamily(families.qa);await restoreFamily(store,initial,families.qa,currentQa.revision,version);
 const currentTrial=await store.currentFamily(manifest.familyId);await restoreFamily(store,initial,manifest.familyId,currentTrial.revision,version);
 await sourceLink(manifest.sourceFamilyId);
 assert.deepEqual((await store.currentFamily(families.qa)).state,initial.saves.find(s=>s.family_id===families.qa).state);
 assert.deepEqual((await store.currentFamily(manifest.familyId)).state,initialTrial.state);
 assert.deepEqual(await store.currentFamily(families.home),beforeHome);
 await writeFile('private/trial-acceptance-report.json',JSON.stringify({checks,errors,restored:true,backupFile,version},null,2),{mode:0o600});
 console.log('QA and trial states restored; trial follows formal content again. Formal save unchanged.');
}
