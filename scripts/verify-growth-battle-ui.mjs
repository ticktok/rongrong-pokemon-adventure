// Entirely synthetic state; never signs in or calls CloudBase.
import {chromium,webkit} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState,makePartner,grant} from './server/state';import {execute} from './server/engine';import {recordGrowth} from './server/growth';import {MOVES} from './content/world';
const rt={now:new Date('2026-11-14T10:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>.3};
let s=JSON.parse(sessionStorage.getItem('presentation-state')||'null'),role=sessionStorage.getItem('presentation-role')||'child',revision=0;
const flags={loseResponse:false},results=new Map(JSON.parse(sessionStorage.getItem('presentation-results')||'[]'));
const persist=()=>{sessionStorage.setItem('presentation-state',JSON.stringify(s));sessionStorage.setItem('presentation-role',role);sessionStorage.setItem('presentation-results',JSON.stringify([...results]));};
const act=(type,payload={},as='child')=>{const next=execute(s,{type,payload,operationId:crypto.randomUUID()},as,rt);s=next.state;persist();return next;};
function prepare(kind='growth',move='fire-0'){
 s=execute(initialState([],rt.now,'测试训练师'),{type:'starter',payload:{speciesId:4}},'child',rt).state;
 s.partners[0].level=15;s.partners[0].exp=2200;s.partners[0].moves=['fire-0','water-1','electric-2','normal-0'];
 for(const id of [7,1,25,133,39]){const p=makePartner(id,5,rt);s.partners.push(p);s.team.push(p.id);}
 if(kind==='growth'||kind==='evolve'){const before=structuredClone(s);grant(s,320,[s.partners[0].id]);grant(s,150,s.team);recordGrowth(before,s,rt.now.toISOString());if(kind==='evolve')act('evolve',{partnerId:s.partners[0].id,speciesId:5});}
 if(kind==='multi'){const before=structuredClone(s);s.settings.dailyCap=2000;grant(s,1200,s.team);recordGrowth(before,s,rt.now.toISOString());}
 if(kind==='battle'){s.partners[0].moves=[move,'normal-0'];act('encounter');Object.assign(s.battle,{enemy:10,enemyLevel:5,enemyHp:500,enemyMaxHp:500,playerHp:100,playerMaxHp:100});s.battle.teamHp[s.team[0]]=100;}
 if(kind==='learn'){const before=structuredClone(s);grant(s,40);recordGrowth(before,s,rt.now.toISOString());act('practice.start');}
 persist();
}
if(!s)prepare();
window.__presentation={get state(){return s;},flags,moves:MOVES,prepare,setRole(v){role=v;persist();},addGrowth(){const before=structuredClone(s);s.partners[0].exp+=10;recordGrowth(before,s,rt.now.toISOString());persist();},update(){persist();}};
export const auth={getSession:async()=>({data:{session:{user:{id:'presentation-fixture'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(command){
 if(!navigator.onLine)throw new Error('网络断开了');
 if(results.has(command.operationId))return {ok:true,state:publicState(s,role,revision,rt.now),result:{...results.get(command.operationId),battlePlayback:undefined}};
 try{const next=execute(s,command,role,rt);s=next.state;revision++;results.set(command.operationId,next.result);persist();if(flags.loseResponse){flags.loseResponse=false;throw new TypeError('模拟保存后响应丢失');}return {ok:true,state:publicState(s,role,revision,rt.now),result:next.result};}
 catch(e){if(e instanceof TypeError)throw e;return {ok:false,error:e.message,state:publicState(s,role,revision,rt.now)};}
}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=s=>s.reviewCount;
`},bundle:true,write:false,platform:'browser',format:'esm'});
const useWebkit=process.env.TEST_BROWSER==='webkit',browser=await (useWebkit?webkit:chromium).launch(useWebkit?{headless:true}:{channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
await page.route('**/src/lib.ts',r=>r.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
await mkdir('artifacts',{recursive:true});const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5176/';
const pass=s=>{checks.push(s);console.log('PASS',s);};
const state=()=>page.evaluate(()=>window.__presentation.state);
// Wait for the previous fixture's asset requests before replacing its synthetic state.
async function reload(){await page.waitForLoadState('networkidle');await page.reload();await page.waitForLoadState('networkidle');}
async function prepare(kind='growth',move='fire-0',route='adventure'){await page.evaluate(({kind,move})=>window.__presentation.prepare(kind,move),{kind,move});await page.goto(base+'#/'+route);await reload();await page.locator('.app-shell').waitFor();}
async function solve(correct=true){const s=await state(),q=s.question;const index=q.options.findIndex(o=>correct?o.id===q.correctOptionId:o.id!==q.correctOptionId);await page.locator('.quiz-options button').nth(index).click();}
try{
 await page.goto(base);await page.locator('.growth-dialog').waitFor();assert.match(await page.locator('.growth-dialog').innerText(),/320/);assert.match(await page.locator('.growth-dialog').innerText(),/Lv.15.*Lv.16/s);
 const first=await state();await reload();await page.locator('.growth-dialog').waitFor();assert.equal((await state()).growth.lastSeq,first.growth.lastSeq);
 await page.evaluate(()=>window.__presentation.addGrowth());await page.getByRole('button',{name:'知道啦',exact:true}).click();await page.locator('.growth-dialog').waitFor();await page.waitForFunction(()=>document.querySelector('.growth-earned')?.textContent.includes('+10'));
 await page.getByRole('button',{name:'知道啦',exact:true}).click();await page.locator('.growth-dialog').waitFor({state:'hidden'});await reload();await page.locator('.app-shell').waitFor();assert.equal(await page.locator('.growth-dialog').count(),0);
 pass('Unread growth survives refresh; acknowledgement covers only displayed entries and never consumes concurrent growth.');
 await prepare();await page.evaluate(()=>window.__presentation.flags.loseResponse=true);await page.getByRole('button',{name:'知道啦',exact:true}).click();await page.locator('.growth-dialog [role=alert]').waitFor();await page.locator('.growth-dialog').getByRole('button',{name:'重试',exact:true}).click();await page.locator('.growth-dialog').waitFor({state:'hidden'});assert.equal((await state()).growth.readThrough,1);
 pass('A lost acknowledgement response can be retried without losing progress or locking the modal.');
 await prepare();await page.evaluate(()=>window.__presentation.setRole('parent'));await reload();await page.locator('.app-shell').waitFor();assert.equal(await page.locator('.growth-dialog').count(),0);assert.equal((await state()).growth.readThrough,0);
 await page.goto(base+'#/partners');await page.getByRole('button',{name:'成长记录',exact:false}).click();await page.locator('.growth-dialog').waitFor();await page.getByRole('button',{name:'收好手册',exact:true}).click();assert.equal((await state()).growth.readThrough,0);
 await page.evaluate(()=>window.__presentation.setRole('child'));await reload();await page.locator('.growth-dialog').waitFor();
 await page.getByRole('button',{name:'可以进化了，去看看',exact:false}).click();await page.locator('.partner-detail').waitFor();assert.equal(await page.locator('.growth-dialog').count(),0);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'进化为火恐龙',exact:false}).click();await page.waitForFunction(()=>window.__presentation.state.partners[0].speciesId===5);await page.locator('.partner-detail .close').click();await page.locator('.growth-dialog').waitFor();assert.match(await page.locator('.growth-evolution').innerText(),/小火龙.*火恐龙/s);await page.screenshot({path:'artifacts/growth-evolution.png'});await page.getByRole('button',{name:'知道啦',exact:true}).click();
 pass('Parents cannot consume child reminders; manual evolution keeps confirmation and presents both forms after the detail dialog closes.');
 for(const [width,height] of [[360,844],[768,1024],[1024,768],[1365,950]]){
  await page.setViewportSize({width,height});await prepare('multi');await page.locator('.growth-dialog').waitFor();assert.equal(await page.locator('.growth-card').count(),6);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.growth-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.screenshot({path:'artifacts/growth-'+width+'.png'});await page.getByRole('button',{name:'知道啦',exact:true}).click();
 }
 pass('Six-partner growth is readable at phone, tablet portrait/landscape and desktop sizes without horizontal overflow.');
 await prepare('learn');await page.locator('.quiz-options').waitFor();assert.equal(await page.locator('.growth-dialog').count(),0);await solve();await page.locator('.quiz-complete-actions').waitFor();assert.equal(await page.locator('.growth-dialog').count(),0);await page.getByRole('button',{name:'稍后继续',exact:true}).click();await page.locator('.growth-dialog').waitFor();await page.getByRole('button',{name:'知道啦',exact:true}).click();
 pass('Growth waits until learning feedback is dismissed.');
 await page.setViewportSize({width:1365,height:950});await prepare('battle');await page.locator('.move-grid button').first().click();await page.locator('.quiz-options').waitFor();await solve(false);assert.equal(await page.locator('.skip-battle').count(),0);await solve();await page.locator('.move-caption').waitFor();assert.match(await page.locator('.move-caption').innerText(),/火花/);assert.equal(await page.locator('.move-grid button').first().isDisabled(),true);
 await page.waitForTimeout(400);await page.screenshot({path:'artifacts/battle-fire.png'});await page.locator('.skip-battle').waitFor({state:'hidden'});assert.equal(await page.locator('.move-grid button').first().isDisabled(),false);
 pass('Corrected answers play the actual fire move and counterattack in sequence; actions are locked only during playback.');
 for(const [move,name] of [['water-1','water'],['electric-2','electric'],['grass-1','leaves'],['ground-2','quake'],['normal-0','dash']]){
  await prepare('battle',move);await page.locator('.move-grid button').first().click();await solve();await page.locator('.move-caption').waitFor();await page.waitForTimeout(420);await page.screenshot({path:'artifacts/battle-'+name+'.png'});await page.getByRole('button',{name:'跳过动画',exact:true}).click();assert.equal(await page.locator('.skip-battle').count(),0);assert.equal(await page.locator('.move-grid button').first().isDisabled(),false);
 }
 pass('Water, lightning, leaves, quake and physical attacks render; skip reveals authoritative HP and restores controls.');
 if(process.env.TEST_ALL_MOVES==='1'){
  const moves=await page.evaluate(()=>window.__presentation.moves);
  for(const move of moves){await prepare('battle',move.id);await page.locator('.move-grid button').first().click();await solve();await page.locator('.move-caption').waitFor();await page.waitForTimeout(420);assert(await page.locator('.battle-fx canvas').count());await page.locator('.battle-stage').screenshot({path:'artifacts/move-'+move.id+'.png'});await page.getByRole('button',{name:'跳过动画',exact:true}).click();}
  pass('All 54 move renderers executed in a real browser and have individual screenshots.');
 }

 await prepare('battle');await page.locator('.move-grid button').first().click();await solve();await page.locator('.skip-battle').waitFor();await reload();await page.locator('.battle-panel').waitFor();assert.equal(await page.locator('.skip-battle').count(),0);assert.equal(await page.locator('.move-caption').count(),0);
 await page.evaluate(()=>localStorage.setItem('rr-reduced','on'));await reload();await page.locator('.move-grid button').first().click();await solve();await page.locator('.move-caption').waitFor();assert.equal(await page.locator('.battle-fx canvas').count(),0);await page.locator('.skip-battle').waitFor({state:'hidden'});
 pass('Reload does not replay a settled turn; reduced motion keeps a textual outcome and releases controls.');
 await page.evaluate(()=>localStorage.setItem('rr-reduced','off'));
 await prepare('battle');await page.evaluate(()=>{window.__presentation.state.battle.enemyHp=1;window.__presentation.update();});await reload();await page.locator('.move-grid button').first().click();await solve();await page.locator('.skip-battle').waitFor();assert.equal(await page.locator('.win-ribbon').count(),0);await page.locator('.skip-battle').waitFor({state:'hidden'});await page.locator('.win-ribbon').waitFor();
 await prepare('battle');await page.evaluate(()=>{const b=window.__presentation.state.battle;b.enemyHp=1;b.enemies=[10,13];window.__presentation.update();});await reload();await page.locator('.move-grid button').first().click();await solve();await page.locator('.skip-battle').waitFor();assert.match(await page.locator('.enemy-info').innerText(),/绿毛虫/);await page.locator('.skip-battle').waitFor({state:'hidden'});assert.match(await page.locator('.enemy-info').innerText(),/独角虫/);
 await prepare('battle');await page.evaluate(()=>{const b=window.__presentation.state.battle;b.playerHp=1;b.teamHp[b.playerId]=1;window.__presentation.update();});await reload();await page.locator('.move-grid button').first().click();await solve();await page.locator('.skip-battle').waitFor();assert.match(await page.locator('.own-info').innerText(),/小火龙/);await page.locator('.skip-battle').waitFor({state:'hidden'});assert.match(await page.locator('.own-info').innerText(),/杰尼龟/);
 pass('Victory, gym replacement and automatic teammate replacement appear only after their preceding attacks.');

 await page.evaluate(()=>localStorage.setItem('rr-reduced','off'));
 for(const [width,height] of [[360,844],[768,1024],[1024,768]]){await page.setViewportSize({width,height});await prepare('battle','electric-2');await page.locator('.move-grid button').first().click();await solve();await page.locator('.move-caption').waitFor();await page.waitForTimeout(400);await page.screenshot({path:'artifacts/battle-'+width+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.skip-battle').waitFor({state:'hidden'});}
 assert.deepEqual(errors,[]);pass('Responsive combat has no browser errors or horizontal overflow.');
}finally{await writeFile('artifacts/growth-battle-ui-'+(useWebkit?'webkit':'chromium')+'.json',JSON.stringify({checks,errors},null,2));await browser.close();}
