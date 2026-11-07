// Real deployed function calls; only the isolated QA family is changed and restored.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';import {join,resolve} from 'node:path';
import cloudbase from '@cloudbase/node-sdk';
import assert from 'node:assert/strict';
import {loadOps,settings} from './ops-lib.mjs';
const {BackupStore,restoreFamily,execute,initialState,decodeBackup}=await loadOps(),{envId,apiKey,version}=await settings(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json')),accounts=JSON.parse(await readFile('private/account-identities.json'));
assert.notEqual(families.qa,families.home);
const before=await store.snapshot(version,'manual'),original=before.saves.find(s=>s.family_id===families.qa);assert(original&&!original.content_source_family_id);
await mkdir('private/backups',{recursive:true});await mkdir('artifacts',{recursive:true});
await writeFile('private/backups/scheduler-qa-'+randomUUID()+'.json.gz',gzipSync(JSON.stringify(before)),{mode:0o600,flag:'wx'});await store.uploadVerified(before);
const base=process.env.TEST_URL??JSON.parse(await readFile('deployment.json')).url;
const publicKey=(await readFile('.env.local','utf8')).match(/^VITE_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');assert(publicKey);
const sdk=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`import cloudbase from '@cloudbase/js-sdk';window.__qaCloud=cloudbase.init(${JSON.stringify({env:envId,region:'ap-shanghai',accessKey:publicKey})});`},bundle:true,write:false,platform:'browser',format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1024,height:950},serviceWorkers:'block'});page.setDefaultTimeout(60000);
const report={version,checks:[],errors:[],qaRestored:false,otherFamiliesUnchanged:false};page.on('pageerror',e=>report.errors.push(e.message));
const pass=message=>{report.checks.push(message);console.log('PASS',message);},current=()=>store.currentFamily(families.qa);
async function command(type,payload={},operationId=randomUUID()){
 if(!await page.evaluate(()=>!!window.__qaCloud))await page.addScriptTag({content:sdk.outputFiles[0].text});
 const result=await page.evaluate(async({type,payload,operationId})=>{const {data,error}=await window.__qaCloud.auth.getSession();if(error||!data?.session)throw Error('Missing QA session');const r=await window.__qaCloud.callFunction({name:'rongrong-game',data:{type,payload,operationId,expectedUid:String(data.session.user.id)}});return typeof r.result==='string'?JSON.parse(r.result):r.result;},{type,payload,operationId});
 assert.equal(result.ok,true,result.error);assert(!('recentWordIds'in result.state));assert(!result.state.question||!('learningPool'in result.state.question));return result;
}
async function solve(correct=true,operationId=randomUUID()){
 const q=(await current()).state.question;assert(q);
 const payload={questionId:q.id,optionId:q.options.find(o=>(o.id===q.correctOptionId)===correct).id};
 return {response:await command('answer',payload,operationId),payload,q,operationId};
}
try{
 const now=new Date(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),tomorrow=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const words=JSON.parse(await readFile('content/words.json')),rt={now,uuid:randomUUID,random:()=>0.3};
 let state=execute(initialState([{id:'qa-scheduler-npc',name:'测试朋友',kind:'classmate',regionId:'home-meadow',x:10,y:10,line:'测试',quest:'单词'}],now,'测试训练师',''),{type:'starter',payload:{speciesId:25},operationId:randomUUID()},'child',rt).state;
 state.settings.weekdayPassDate=date;
 for(const w of words)state.mastery[w.id]={correct:5,wrong:1,due:'2099-01-01',stage:2};
 for(const w of words.slice(0,20))delete state.mastery[w.id];for(const w of words.slice(20,40))state.mastery[w.id].due=date;
 await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:original.revision,p_state:state,p_result:{message:'Prepare isolated scheduler QA'}});
 const account=accounts.find(a=>a.username==='rongrong-qa-child');assert(account);
 await page.goto(base);const notice=page.getByRole('button',{name:/^确定访问/});if(await notice.count())await notice.click();
 await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();await page.locator('.app-shell').waitFor();
 const pools=[],ids=[];
 for(let i=0;i<10;i++){
  await command('practice.start');const q=(await current()).state.question;assert(q);pools.push(q.learningPool);ids.push(q.wordId);
  if(i===2){await solve(false);const failed=structuredClone((await current()).state.mastery[q.wordId]);assert.equal(failed.due,tomorrow);await page.reload();await page.locator('.word-explanation').waitFor();await solve(true);assert.deepEqual((await current()).state.mastery[q.wordId],failed);}
  else {const result=await solve();if(i===0){const stored=await current();await command('answer',result.payload,result.operationId);assert.deepEqual(await current(),stored);}}
 }
 assert.equal(pools.filter(p=>p==='new').length,4);assert.equal(pools.filter(p=>p==='due').length,6);assert.equal(new Set(ids).size,10);
 pass('Four new and six due words; no daily repeats; correction/reload/replayed operation preserve one memory update.');
 await command('practice.start',{mode:'review'});assert.equal((await current()).state.question.learningPool,'due');await solve();
 await command('npc.challenge',{npcId:'qa-scheduler-npc'});await solve();
 await command('encounter');state=(await current()).state;await command('battle.move',{moveId:state.partners.find(p=>p.id===state.battle.playerId).moves[0]});await solve();await command('battle.leave');
 await command('encounter');await command('battle.catch');await solve();await command('battle.leave');
 const saved=await current();assert(Object.values(saved.state.mastery).filter(m=>m.fsrs).length>=13);
 pass('Review, NPC, battle and capture all update the shared FSRS memory through real client calls.');
 const {credential}=JSON.parse(await readFile(join(homedir(),'.config','.cloudbase','projects',resolve('.').replace(/[^a-zA-Z0-9]/g,'-'),'auth.json')));assert.equal(credential.envId,envId);
 const management=cloudbase.init({env:envId,region:'ap-shanghai',secretId:credential.secretId,secretKey:credential.secretKey,sessionToken:credential.token});
 const backup=await management.callFunction({name:'rongrong-backup',data:{}});assert.equal(backup.result?.ok,true);
 const verified=decodeBackup(await store.download(backup.result.key),envId);assert.deepEqual(verified.saves.find(s=>s.family_id===families.qa).state,saved.state);
 pass('Deployed backup function preserves and verifies FSRS cards and recent-word history.');
 await page.goto(base+'#/learning');await page.reload();await page.getByText('根据掌握情况安排复习。记得越牢，间隔越长；答错的词明天再练。',{exact:true}).waitFor();
 assert((await page.locator('.app-footer').innerText()).includes('v'+version));await page.screenshot({path:'artifacts/scheduler-live-tablet.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/scheduler-live-mobile.png',fullPage:true});
 assert.deepEqual(report.errors,[]);pass('Adaptive review copy and counts render on tablet/mobile without browser errors.');
}finally{
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);report.qaRestored=true;
 for(const old of before.saves.filter(s=>s.family_id!==families.qa)){const after=await store.currentFamily(old.family_id);assert.equal(after.revision,old.revision,'Concurrent progress requires inspection');assert.deepEqual(after.state,old.state);}
 report.otherFamiliesUnchanged=true;await writeFile('artifacts/scheduler-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; other families unchanged.');
}
