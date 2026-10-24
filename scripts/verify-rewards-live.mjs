// Uses only the isolated QA family. Formal and trial saves are read-only.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {loadOps,settings} from './ops-lib.mjs';
const {BackupStore,restoreFamily,execute,initialState,makePartner,validateSave}=await loadOps(),{envId,apiKey,version}=await settings(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json','utf8')),accounts=JSON.parse(await readFile('private/account-identities.json','utf8'));
assert.notEqual(families.qa,families.home);
const before=await store.snapshot(version,'manual'),original=before.saves.find(s=>s.family_id===families.qa);
assert(original&&!original.content_source_family_id);
await mkdir('private/backups',{recursive:true});await mkdir('artifacts',{recursive:true});
await writeFile('private/backups/rewards-qa-'+randomUUID()+'.json.gz',gzipSync(JSON.stringify(before)),{mode:0o600,flag:'wx'});await store.uploadVerified(before);
const base=process.env.TEST_URL??JSON.parse(await readFile('deployment.json','utf8')).url;
const publicKey=(await readFile('.env.local','utf8')).match(/^VITE_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');assert(publicKey);
const sdk=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`import cloudbase from '@cloudbase/js-sdk';window.__qaCloud=cloudbase.init(${JSON.stringify({env:envId,region:'ap-shanghai',accessKey:publicKey})});`},bundle:true,write:false,platform:'browser',format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={version,checks:[],errors:[],qaRestored:false,otherFamiliesUnchanged:false};
const pass=message=>{report.checks.push(message);console.log('PASS',message);};
const current=()=>store.currentFamily(families.qa);
async function commit(state){const row=await current();await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:row.revision,p_state:state,p_result:{message:'Isolated rewards QA fixture'}});}
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
 state.settings.tasks=['语文练习','数学练习','英语练习','阅读','整理书包'].map((name,i)=>({id:'qa-task-'+i,name,active:true}));state.settings.fastMultiplier=1;state.settings.dailyCap=250;
 await commit(state);
 const child=await login('child'),parent=await login('parent');
 for(const name of ['语文练习','数学练习','英语练习'])await child.locator('.daily-tasks').getByRole('checkbox',{name:new RegExp(name)}).check();
 await child.getByRole('button',{name:'提交 3 项任务',exact:true}).click();await child.getByRole('button',{name:'等待家长确认',exact:true}).waitFor();
 assert.equal((await command(child,'parent.review',{date:state.daily.date,approvedTaskIds:['qa-task-0'],submissionVersion:1})).ok,false);
 await parent.reload();await parent.getByRole('checkbox',{name:'通过英语练习',exact:true}).uncheck();await parent.getByRole('textbox',{name:'给孩子的留言'}).fill('英语练习补充后今天再交');await parent.getByRole('button',{name:'通过 2 项，退回 1 项',exact:true}).click();await parent.getByText('今天没有待审核的打卡').waitFor();
 let saved=await current();assert.equal(saved.state.checkins[0].status,'partial');assert.equal(saved.state.checkins[0].review.settled,92);validateSave(saved.state);
 const invocation=await promisify(execFile)(process.execPath,['node_modules/@cloudbase/cli/bin/tcb','fn','invoke','rongrong-backup','--env-id',envId,'--json'],{timeout:60000,maxBuffer:1024*1024});
 await writeFile('private/backups/rewards-backup-invoke-'+randomUUID()+'.json',invocation.stdout,{mode:0o600,flag:'wx'});
 assert(/backup_verified/.test(invocation.stdout)||/\\?"ok\\?"\s*:\s*true/.test(invocation.stdout),'Backup function must confirm a verified snapshot of partial state');
 pass('Deployed parent partially approves real QA submission; child role cannot approve; backup function accepts and verifies the new state.');
 await child.reload();await child.locator('.task-rejected').waitFor();assert.equal(await child.locator('.task-approved').count(),2);
 for(const name of ['英语练习','阅读','整理书包'])await child.locator('.daily-tasks').getByRole('checkbox',{name:new RegExp(name)}).check();await child.getByRole('button',{name:'提交 3 项任务',exact:true}).click();await child.getByRole('button',{name:'等待家长确认',exact:true}).waitFor();
 assert.equal((await command(parent,'parent.review',{date:state.daily.date,approvedTaskIds:['qa-task-2'],submissionVersion:1})).ok,false);
 const operationId=randomUUID(),payload={date:state.daily.date,approvedTaskIds:['qa-task-2','qa-task-3','qa-task-4'],submissionVersion:2};
 const approved=await command(parent,'parent.review',payload,operationId);assert.equal(approved.ok,true,approved.error);const repeated=await command(parent,'parent.review',payload,operationId);assert.equal(repeated.state.revision,approved.state.revision);assert.deepEqual(repeated.state.partners,approved.state.partners);assert.equal(repeated.state.checkins[0].review.settled,230);
 pass('Same-day remaining tasks submit independently; stale batch is rejected; retried real operation pays exactly once.');
 await child.reload();await child.getByRole('button',{name:'开始今天的练习',exact:true}).click();
 for(let i=0;i<10;i++){await child.locator('.quiz-options button').first().waitFor();const q=(await current()).state.question;assert(q);await child.locator('.quiz-options button').nth(q.options.findIndex(o=>o.id===q.correctOptionId)).click();await child.locator('.quiz-complete-actions').waitFor();if(i<9)await child.getByRole('button',{name:'下一题',exact:true}).click();}
 saved=await current();assert.equal(saved.state.checkins[0].review.settled,276);assert.equal(saved.state.daily.expGranted,250);assert.equal(saved.state.carry,26);
 await child.screenshot({path:'artifacts/rewards-live-english.png',animations:'disabled'});await child.getByRole('button',{name:'完成挑战',exact:true}).click();
 pass('Ten real daily answers after approval top up the reward; the QA cap is respected and overflow preserved.');
 await child.getByRole('button',{name:'发现图鉴',exact:true}).click();await child.locator('#dex-card-25').waitFor();const beforeDex=await current();
 const type=name=>child.locator('.dex-type-options button').filter({hasText:new RegExp('^'+name+'$')});await type('火').click();await type('飞行').click();assert.equal(await child.locator('.dex-card').count(),2);await type('水').click();assert.equal(await type('火').getAttribute('aria-pressed'),'false');assert.equal(await type('飞行').getAttribute('aria-pressed'),'true');assert.equal(await type('水').getAttribute('aria-pressed'),'true');
 await child.setViewportSize({width:390,height:844});await child.locator('.dex-type-toggle').click();assert.match(await child.locator('.dex-type-toggle').innerText(),/飞行 \+ 水/);assert(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await child.screenshot({path:'artifacts/rewards-live-dex.png',animations:'disabled'});
 assert.deepEqual(await current(),beforeDex);pass('Deployed dual-type intersection and FIFO replacement work on tablet/mobile without save writes.');
 state=(await current()).state;state.partners[0].exp=24010;state.partners[0].level=50;const growing=makePartner(4,5,rt);state.partners.push(growing);state.team=[growing.id];state.carry=0;state.carryTargets=[];state.carryByPartner={};state.unallocatedExp=80;state.daily.expGranted=0;await commit(state);
 await child.goto(base+'#/partners');await child.reload();await child.getByRole('button',{name:'领取到当前小队',exact:true}).click();await child.getByRole('button',{name:'领取到当前小队',exact:true}).waitFor({state:'hidden'});saved=await current();assert.equal(saved.state.unallocatedExp,0);assert.equal(saved.state.partners.find(p=>p.id===growing.id).exp,240);
 await command(child,'bootstrap');const denied=await child.evaluate(async()=>{try{const r=await window.__qaCloud.callFunction({name:'rongrong-backup',data:{Type:'Timer'}});const v=typeof r.result==='string'?JSON.parse(r.result):r.result;return v?.ok!==true;}catch{return true;}});assert(denied);
 pass('Reserved experience is claimable by a growing team; authenticated clients cannot invoke the private backup function.');
 for(const path of ['assets/pokemon/art/1.png','assets/pokemon/art/151.png','manifest.webmanifest','sw.js']){const r=await fetch(base+path);assert(r.ok);if(path==='sw.js')assert((await r.text()).includes(version));}
 assert.deepEqual(report.errors,[]);pass('Versioned service worker and static assets are reachable; no uncaught browser errors.');
}finally{
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);report.qaRestored=true;
 for(const row of before.saves.filter(s=>s.family_id!==families.qa)){const after=await store.currentFamily(row.family_id);assert.equal(after.revision,row.revision,'Another family changed concurrently; inspect before releasing');assert.deepEqual(after.state,row.state);}
 report.otherFamiliesUnchanged=true;await writeFile('artifacts/rewards-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; all other families unchanged.');
}
