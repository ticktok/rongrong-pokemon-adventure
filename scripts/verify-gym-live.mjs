// Uses only the isolated QA family. Formal and trial saves are read-only.
import {chromium} from '@playwright/test';
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
await writeFile('private/backups/gym-qa-'+randomUUID()+'.json.gz',gzipSync(JSON.stringify(before)),{mode:0o600,flag:'wx'});await store.uploadVerified(before);
const base=process.env.TEST_URL??JSON.parse(await readFile('deployment.json','utf8')).url;
const publicKey=(await readFile('.env.local','utf8')).match(/^VITE_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');assert(publicKey);
const sdk=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`import cloudbase from '@cloudbase/js-sdk';window.__qaCloud=cloudbase.init(${JSON.stringify({env:envId,region:'ap-shanghai',accessKey:publicKey})});`},bundle:true,write:false,platform:'browser',format:'iife'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={version,checks:[],errors:[],qaRestored:false,otherFamiliesUnchanged:false};
const pass=message=>{report.checks.push(message);console.log('PASS',message);};
const current=()=>store.currentFamily(families.qa);
async function commit(state){const row=await current();await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:row.revision,p_state:state,p_result:{message:'Isolated gym QA fixture'}});}
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
 state.settings.weekdayPassDate=state.daily.date;state.partners[0].level=50;state.partners[0].exp=24010;
 await commit(state);const child=await login('child');
 await child.getByRole('button',{name:'我的收藏',exact:true}).click();await child.locator('.badge-card').first().waitFor();assert.equal(await child.locator('.badge-card.earned').count(),0);
 const id=randomUUID();const outcomes=await Promise.all([command(child,'gym.start',{},id),command(child,'gym.start')]);assert.equal(outcomes.filter(r=>r.ok).length,1);const winner=outcomes.find(r=>r.ok);assert.equal(winner.state.daily.gymStarts,1);assert.equal((await current()).state.daily.gymStarts,1);
 if(outcomes[0].ok){const repeated=await command(child,'gym.start',{},id);assert.equal(repeated.ok,true);assert.equal(repeated.state.battle.id,winner.state.battle.id);assert.equal(repeated.state.daily.gymStarts,1);}
 pass('Concurrent real QA requests create one gym battle and consume one start; operation replay remains idempotent.');
 let row=await current();for(let turns=0;row.state.battle.status==='active'&&turns<30;turns++){
  const player=row.state.partners.find(p=>p.id===row.state.battle.playerId);const attack=await command(child,'battle.move',{moveId:player.moves[0]});assert(attack.ok,attack.error);row=await current();const q=row.state.question;const answer=await command(child,'answer',{questionId:q.id,optionId:q.correctOptionId});assert(answer.ok,answer.error);row=await current();
 }
 assert.equal(row.state.battle.status,'won');assert.equal(row.state.badges.length,1);assert.equal(row.state.gymProgress.firstWins['home-meadow'],state.daily.date);validateSave(row.state);
 await command(child,'battle.leave');const denied=await command(child,'gym.start');assert.equal(denied.ok,false);assert.match(denied.error,/已用完/);const map=await command(child,'world.position',{regionId:'blue-river',x:19,y:18});assert.equal(map.ok,false);assert.match(map.error,/开放/);
 await child.reload();await child.locator('.badge-card.earned').waitFor();assert.equal(await child.locator('.badge-card.earned').count(),1);assert(await child.locator('.badge-art img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)));await child.screenshot({path:'artifacts/gym-live-collection.png',fullPage:true});
 pass('Real QA battle awards a dated badge; same-day replay and next-region entry are denied; deployed collection shows artwork.');
 state=(await current()).state;delete state.gymProgress;state.events=[];state.daily.gymStarts=0;await commit(state);const legacy=await command(child,'bootstrap');assert(legacy.ok);assert.equal(legacy.state.adventureAccess['blue-river'].regionOpen,true);assert.equal(legacy.state.adventureAccess['blue-river'].gymAvailable,false);assert.deepEqual(legacy.state.gymProgress.firstWins,{});const date=legacy.state.gymProgress.initializedOn;const again=await command(child,'bootstrap');assert.equal(again.state.gymProgress.initializedOn,date);assert.equal(again.state.adventureAccess['blue-river'].gymEligibleOn,legacy.state.adventureAccess['blue-river'].gymEligibleOn);
 await command(child,'world.position',{regionId:'blue-river',x:19,y:18});assert.equal((await command(child,'gym.start')).ok,false);pass('Legacy QA preserves unlocked region; missing dates initialize once and cannot bypass gym cooldown.');
 await child.setViewportSize({width:390,height:844});await child.reload();await child.locator('.badge-card').first().waitFor();assert(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await child.locator('.badge-card time').count(),0);assert.deepEqual(report.errors,[]);
}finally{
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);report.qaRestored=true;
 for(const row of before.saves.filter(s=>s.family_id!==families.qa)){const after=await store.currentFamily(row.family_id);assert.equal(after.revision,row.revision,'Another family changed concurrently; inspect before releasing');assert.deepEqual(after.state,row.state);}
 report.otherFamiliesUnchanged=true;await writeFile('artifacts/gym-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; all other families unchanged.');
}
