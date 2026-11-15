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
async function commit(state){validateSave(state);const row=await current();await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:row.revision,p_state:state,p_result:{message:'Isolated encounter/capture/music QA fixture'}});}
async function login(role){
 const account=accounts.find(a=>a.username==='rongrong-qa-'+role);assert(account);
 const page=await browser.newPage({viewport:{width:1024,height:900},serviceWorkers:'block'});
 await page.addInitScript(()=>{window.__bgmStarted=[];const original=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__bgmStarted.push({loop:this.loop,duration:this.buffer?.duration});return original.apply(this,args);};});page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base);const notice=page.getByRole('button',{name:/^确定访问/});if(await notice.count())await notice.click();
 await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();await page.locator('.app-shell').waitFor();
 assert((await page.locator('.app-footer').innerText()).includes('v'+version));return page;
}
async function command(page,type,payload={},operationId=randomUUID()){
 if(!await page.evaluate(()=>!!window.__qaCloud))await page.addScriptTag({content:sdk.outputFiles[0].text});
 return page.evaluate(async({type,payload,operationId})=>{const {data,error}=await window.__qaCloud.auth.getSession();if(error||!data?.session)throw new Error('QA session unavailable');const response=await window.__qaCloud.callFunction({name:'rongrong-game',data:{type,payload,operationId,expectedUid:String(data.session.user.id)}});return typeof response.result==='string'?JSON.parse(response.result):response.result;},{type,payload,operationId});
}
try{
 const now=new Date(),rt={now,uuid:randomUUID,random:()=>0};
 function fixture(mode){
  let state=initialState([],now,'测试训练师','');state.started=true;state.partners=[makePartner(25,15,rt),makePartner(4,5,rt),makePartner(7,5,rt)];state.team=state.partners.map(p=>p.id);state.settings.captureLimit=30;state.settings.weekdayPassDate=state.daily.date;state.settings.catchBonus=mode==='success'?.5:0;
  state=execute(state,{type:'bootstrap',payload:{},operationId:randomUUID()},'child',rt).state;
  if(mode==='world'){state.position={regionId:'home-meadow',x:5,y:19};return state;}
  state=execute(state,{type:'encounter',payload:{},operationId:randomUUID()},'child',rt).state;
  Object.assign(state.battle,{enemy:mode==='success'?10:150,enemies:[mode==='success'?10:150],enemyHp:mode==='success'?1:500,enemyMaxHp:500,playerHp:1000,playerMaxHp:1000});state.battle.teamHp[state.team[0]]=1000;
  return state;
 }
 await commit(fixture('world'));const child=await login('child');
 await child.locator('.world-canvas canvas').waitFor();await child.getByRole('button',{name:'设置',exact:true}).click();await child.waitForFunction(()=>window.__bgmStarted.some(s=>s.loop));await child.getByRole('button',{name:'设置',exact:true}).click();
 pass('Deployed original Game Boy BGM decodes and starts after interaction.');
 // Actual grass walking and production encounter request; no overridden random numbers.
 await child.waitForTimeout(10500);
 for(let i=0;i<80;i++){
  if(await child.locator('.encounter-overlay,.battle-panel').count())break;
  const direction=i%2?'ArrowUp':'ArrowDown';await child.keyboard.down(direction);await child.waitForTimeout(80);await child.keyboard.up(direction);await child.waitForTimeout(150);
 }
 await child.locator('.battle-panel').waitFor();await child.locator('.encounter-overlay').waitFor({state:'hidden'});assert.equal((await current()).state.battle.kind,'wild');
 pass('Deployed grass movement completes the encounter transition and creates one authoritative wild battle.');
 for(const mode of ['success','failure']){
  let observed=false;
  for(let attempt=0;attempt<10&&!observed;attempt++){
   await commit(fixture(mode));await child.reload();await child.locator('.capture-button').waitFor();await child.locator('.capture-button').click();await child.locator('.quiz-options').waitFor();
   const q=(await current()).state.question,index=q.options.findIndex(o=>o.id===q.correctOptionId);await child.locator('.quiz-options button').nth(index).click();
   await child.locator('[data-capture-phase="shake-1"]').waitFor();assert.equal(await child.locator('.capture-result').count(),0);assert.equal(await child.locator('.team-mini').count(),3);
   const result=(await current()).state.battle.status;
   const phase=result==='caught'?'success':'breakout';await child.locator('[data-capture-phase="'+phase+'"]').waitFor();
   if(result==='caught')assert.equal(await child.locator('.capture-stars svg').count(),3);else assert.equal(await child.locator('.capture-result').count(),0);
   await child.screenshot({path:'artifacts/cinema-live-'+phase+'.png'});await child.locator('.skip-battle').waitFor({state:'hidden'});
   observed=mode==='success'?result==='caught':result!=='caught';
   if(observed&&mode==='success'){await child.waitForFunction(()=>window.__bgmStarted.some(s=>!s.loop&&s.duration<6));await child.reload();await child.locator('.capture-result').waitFor();assert.equal(await child.locator('.skip-battle').count(),0);}
  }
  assert(observed,'Did not observe '+mode+' within isolated QA attempts');
  pass('Deployed capture '+mode+' matches server result, preserves delayed reveal and finishes without stuck controls.');
 }
 await child.getByRole('button',{name:'学习手册',exact:true}).click();await child.locator('.learning-grid').waitFor();
 for(const path of ['music-credits.html','assets/bgm/pallet.mp3','assets/bgm/capture.mp3','sw.js']){const response=await fetch(base+path);assert(response.ok,path+' HTTP '+response.status);if(path==='sw.js')assert((await response.text()).includes(version));}
 validateSave((await current()).state);assert.deepEqual(report.errors,[]);
 pass('Deployed music assets, release version, learning route and compatible QA save verified.');
}finally{
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);report.qaRestored=true;
 for(const row of before.saves.filter(s=>s.family_id!==families.qa)){const after=await store.currentFamily(row.family_id);assert.equal(after.revision,row.revision,'Another family changed concurrently; inspect before release');assert.deepEqual(after.state,row.state);}
 report.otherFamiliesUnchanged=true;await writeFile('artifacts/encounter-music-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; other families unchanged.');
}
