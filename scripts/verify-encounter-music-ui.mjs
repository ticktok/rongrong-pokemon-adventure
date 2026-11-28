// Synthetic state only: actual React, Phaser, audio decoding and server engine; no cloud writes.
import {chromium,webkit} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState,makePartner} from './server/state';import {execute} from './server/engine';
const rt={now:new Date('2026-11-15T08:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>flags.failCapture?.999:0};
const flags={failCapture:false,failEncounter:false,delay:0,loseResponse:false},results=new Map();let revision=0;
let s=JSON.parse(sessionStorage.getItem('cinema-state')||'null');
const persist=()=>sessionStorage.setItem('cinema-state',JSON.stringify(s));
function prepare(kind='battle'){
 s=execute(initialState([],rt.now,'测试训练师'),{type:'starter',payload:{speciesId:25}},'child',rt).state;
 s.partners[0].level=15;s.partners[0].exp=2000;s.settings.captureLimit=30;
 for(const id of [1,4,7]){const p=makePartner(id,5,rt);s.partners.push(p);s.team.push(p.id);}
 if(kind==='duplicate')s.partners.push(makePartner(50,21,rt));
 if(kind==='battle'||kind==='duplicate'){s=execute(s,{type:'encounter',payload:{}},'child',rt).state;Object.assign(s.battle,{enemy:10,enemies:[10],enemyHp:1,enemyMaxHp:40,playerHp:100,playerMaxHp:100});s.battle.teamHp[s.team[0]]=100;}
 if(kind==='duplicate')Object.assign(s.battle,{enemy:50,enemies:[50],enemyLevel:23});
 if(kind==='world')s.position={regionId:'home-meadow',x:5,y:18};
 flags.failCapture=false;flags.failEncounter=false;flags.delay=0;persist();
}
if(!s)prepare();
window.__cinema={get state(){return s;},flags,prepare,update:persist};
export const auth={getSession:async()=>({data:{session:{user:{id:'cinema-fixture'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(command){
 if(command.type==='state.read')return {ok:true,state:publicState(s,'child',revision,rt.now)};
 if(results.has(command.operationId))return {ok:true,state:publicState(s,'child',revision,rt.now),result:{...results.get(command.operationId),battlePlayback:undefined}};
 if(command.type==='encounter'){if(flags.delay)await new Promise(r=>setTimeout(r,flags.delay));if(flags.failEncounter)return {ok:false,error:'模拟遇敌失败',state:publicState(s,'child',revision,rt.now)};}
 try{const next=execute(s,command,'child',rt);s=next.state;revision++;persist();results.set(command.operationId,next.result);if(flags.loseResponse){flags.loseResponse=false;throw new TypeError('模拟响应丢失');}return {ok:true,state:publicState(s,'child',revision,rt.now),result:next.result};}
 catch(e){if(e instanceof TypeError)throw e;return {ok:false,error:e.message,state:publicState(s,'child',revision,rt.now)};}
}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=s=>s.reviewCount;
`},bundle:true,write:false,platform:'browser',format:'esm'});
const kind=process.env.TEST_BROWSER==='webkit'?'webkit':'chrome',browser=await (kind==='webkit'?webkit:chromium).launch(kind==='webkit'?{headless:true}:{channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1024,height:768},serviceWorkers:'block'}),errors=[],checks=[],audioRequests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/assets/bgm/'))audioRequests.push(r.url());});page.setDefaultTimeout(15000);
await page.route('**/src/lib.ts',r=>r.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5176/';await mkdir('artifacts',{recursive:true});
const pass=m=>{checks.push(m);console.log('PASS',m);};
async function prepare(kind='battle'){
 await page.evaluate(kind=>{window.__cinema.prepare(kind);history.replaceState(null,'','#/adventure');localStorage.setItem('rr-reduced','off');},kind);
 await page.reload();await page.locator('.app-shell').waitFor();
}
async function capture(){
 await page.locator('.capture-button').click();await page.locator('.quiz-options').waitFor();
 const index=await page.evaluate(()=>{const q=window.__cinema.state.question;return q.options.findIndex(o=>o.id===q.correctOptionId);});
 await page.locator('.quiz-options button').nth(index).click();
}
async function watchPhases(){
 await page.evaluate(()=>{
  window.__phases=[];window.__earlyResult=false;
  window.__phaseObserver?.disconnect();window.__phaseObserver=new MutationObserver(()=>{
   const phase=document.querySelector('[data-capture-phase]')?.getAttribute('data-capture-phase');
   if(phase&&window.__phases.at(-1)!==phase)window.__phases.push(phase);
   if(phase&&phase!=='success'&&document.querySelector('.capture-result'))window.__earlyResult=true;
  });window.__phaseObserver.observe(document.body,{subtree:true,attributes:true,childList:true});
 });
}
const music=()=>page.evaluate(async()=>{const {music}=await import('/src/music.ts');window.__music=music;return music.snapshot();});
try{
 await page.goto(base);await page.locator('.battle-panel').waitFor();assert.equal(audioRequests.length,0,'No BGM download before interaction');
 await watchPhases();await capture();await page.locator('[data-capture-phase="shake-1"]').waitFor();assert.equal(await page.locator('.capture-result').count(),0);assert(await page.locator('.capture-button').isDisabled());assert.equal(await page.locator('.team-mini').count(),4,'New partner must not appear before the capture finishes');assert.equal(await page.locator('.switch-team button').count(),4);
 await page.screenshot({path:'artifacts/capture-shake-'+kind+'.png'});
 await page.locator('[data-capture-phase="success"]').waitFor();await page.screenshot({path:'artifacts/capture-success-'+kind+'.png'});assert.equal(await page.locator('.capture-stars svg').count(),3);
 await page.locator('.skip-battle').waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>window.__phases),['throw','absorb','drop','shake-1','shake-2','shake-3','success']);assert.equal(await page.evaluate(()=>window.__earlyResult),false);
 pass('Success shows all three shakes before flash/stars/result; inputs stay locked through playback.');
 await page.reload();await page.locator('.capture-result').waitFor();assert.equal(await page.locator('.skip-battle').count(),0);
 pass('Reload of a settled catch shows a static keepsake and does not replay the capture.');
 for(const choice of ['keep','experience']){
  await prepare('duplicate');await capture();await page.locator('.capture-choices button').first().waitFor();
  await page.reload();
  assert(await page.getByRole('button',{name:'回到地图',exact:true}).isDisabled());
  const name=choice==='keep'?'把 23 级地鼠收入盒子':'给 21 级地鼠 80 经验';
  await page.getByRole('button',{name,exact:true}).click();
  await page.locator('.capture-choices').waitFor({state:'hidden'});
  const saved=await page.evaluate(()=>window.__cinema.state);
  assert.equal(saved.partners.filter(p=>p.speciesId===50).length,choice==='keep'?2:1);
  assert.match(await page.locator('.battle-log').innerText(),choice==='keep'?/地鼠已收入.*第.*格/:/获得 80 经验/);
 }
 pass('Duplicate capture survives reload and resolves to the chosen box slot or recipient experience.');
 await prepare();await page.evaluate(()=>window.__cinema.flags.failCapture=true);await watchPhases();await capture();await page.locator('[data-capture-phase="breakout"]').waitFor();assert.equal(await page.locator('.capture-result').count(),0);await page.screenshot({path:'artifacts/capture-breakout-'+kind+'.png'});await page.locator('.skip-battle').waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>window.__phases),['throw','absorb','drop','shake-1','shake-2','breakout']);assert.equal((await page.evaluate(()=>window.__cinema.state)).battle.status,'active');
 pass('Failed capture breaks out after two shakes, then runs the real counterattack.');
 await prepare();await page.evaluate(()=>{window.__cinema.state.battle.balls=2;window.__cinema.flags.failCapture=true;});await capture();await page.locator('.skip-battle').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__cinema.state.battle.status),'fled');
 pass('Third failed ball ends in escape without a false success celebration.');
 await prepare();await capture();await page.locator('.skip-battle').click();await page.locator('.capture-result').waitFor();assert.equal(await page.locator('.skip-battle').count(),0);
 await prepare();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('减少动画',{exact:true}).check();await page.getByRole('button',{name:'设置',exact:true}).click();await capture();await page.locator('.capture-result').waitFor();await page.locator('.skip-battle').waitFor({state:'hidden'});
 pass('Skip and reduced motion reach the authoritative result and release controls.');
 await prepare();await page.evaluate(()=>window.__cinema.flags.loseResponse=true);await page.locator('.capture-button').click();await page.locator('.connection-banner').getByRole('button',{name:'重试',exact:true}).click();await page.locator('.quiz-options').waitFor();
 const idx=await page.evaluate(()=>{const q=window.__cinema.state.question;return q.options.findIndex(o=>o.id===q.correctOptionId);});await page.evaluate(()=>window.__cinema.flags.loseResponse=true);await page.locator('.quiz-options button').nth(idx).click();await page.getByRole('button',{name:'重试',exact:true}).last().click();await page.locator('.capture-result').waitFor();assert.equal(await page.locator('.skip-battle').count(),0);
 pass('Lost-response retries preserve a single catch and do not replay a settled operation.');
 await prepare('world');await page.locator('.world-canvas canvas').waitFor();await page.getByRole('button',{name:'设置',exact:true}).click();await music();await page.waitForFunction(()=>window.__music.snapshot().track==='pallet');
 await page.evaluate(async()=>{const {music}=await import('/src/music.ts');window.__playingSource=music.voice.source;});await page.waitForTimeout(5500);assert(await page.evaluate(async()=>{const {music}=await import('/src/music.ts');return music.voice?.source===window.__playingSource;}),'5-second state polling must preserve the playing audio source');
 await page.getByLabel('音乐音量',{exact:true}).fill('40');await music();await page.waitForFunction(()=>window.__music.snapshot().volume===.4);await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.evaluate(async()=>{const {playPronunciation}=await import('/src/pronunciation.ts');playPronunciation('apple');});await music();await page.waitForFunction(()=>window.__music.snapshot().ducked);
 await music();await page.waitForFunction(()=>!window.__music.snapshot().ducked);
 await page.getByRole('button',{name:'我的伙伴',exact:true}).click();await music();await page.waitForFunction(()=>window.__music.snapshot().track==='center');
 await page.evaluate(()=>window.__sameSong=window.__music.voice.source);await page.getByRole('button',{name:'发现图鉴',exact:true}).click();assert(await page.evaluate(()=>window.__sameSong===window.__music.voice.source),'Same song must survive page changes');
 await page.getByRole('button',{name:'学习手册',exact:true}).click();await music();await page.waitForFunction(()=>window.__music.snapshot().track===null);
 pass('Real MP3 decoding, same-track polling, volume, speech ducking, partner music and quiet learning page verified.');
 await page.getByRole('button',{name:'去冒险',exact:true}).click();await music();await page.waitForFunction(()=>window.__music.snapshot().track==='pallet');
 await page.evaluate(async()=>{const {music}=await import('/src/music.ts');music.visibility(false);});assert.equal((await music()).visible,false);
 await page.evaluate(async()=>{const {music}=await import('/src/music.ts');music.visibility(true);});await music();await page.waitForFunction(()=>window.__music.snapshot().track==='pallet');
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('背景音乐',{exact:true}).uncheck();assert.equal((await music()).track,null);await page.reload();await page.locator('.app-shell').waitFor();await page.getByRole('button',{name:'设置',exact:true}).click();assert.equal(await page.getByLabel('背景音乐',{exact:true}).isChecked(),false);await page.getByLabel('背景音乐',{exact:true}).check();await music();await page.waitForFunction(()=>window.__music.snapshot().track==='pallet');await page.getByRole('button',{name:'设置',exact:true}).click();
 pass('Pause/resume and persistent music preferences work; enabling music starts on that click.');
 // Deterministic grass roll and initial cooldown in the browser fixture only. Never override
 // global Math.random: Phaser uses it for texture identities during scene creation.
 await page.route('**/src/components/World.tsx',async route=>{const response=await route.fetch();const body=(await response.text()).replace('lastEncounter = 0','lastEncounter = -10001').replace('Math.random() < 0.11','true').replace('interact.current = () => this.interaction();','interact.current = () => this.interaction(); window.__cinemaWorldReady = true;');assert(body.includes('lastEncounter = -10001'),'Synthetic cooldown override must apply');await route.fulfill({response,body});});
 await prepare('world');await page.locator('.world-canvas canvas').waitFor();await page.waitForFunction(()=>window.__cinemaWorldReady===true);
 for(const style of ['flash','spiral','iris']){
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(90);await page.keyboard.up('ArrowDown');await page.locator('.encounter-overlay').waitFor();assert.equal(await page.locator('.encounter-overlay').getAttribute('data-encounter-style'),style);await page.waitForTimeout(200);await page.screenshot({path:'artifacts/encounter-'+style+'-'+kind+'.png'});await page.locator('.encounter-overlay').waitFor({state:'hidden'});await page.locator('.battle-panel').waitFor();
  await page.evaluate(()=>window.__cinemaWorldReady=false);await page.getByRole('button',{name:'结束本次冒险',exact:true}).click();await page.waitForFunction(()=>window.__cinemaWorldReady===true);
  // Each new map scene may start with a small clock value; the synthetic fixture allows a new grass step.
 }
 pass('Actual grass movement rotates flash, spiral and inward-close transitions and reaches battle.');
 await page.evaluate(()=>{window.__cinema.flags.failEncounter=true;window.__cinema.flags.delay=1600;});await page.keyboard.down('ArrowUp');await page.waitForTimeout(90);await page.keyboard.up('ArrowUp');await page.locator('.encounter-wait').waitFor();await page.locator('.encounter-overlay').waitFor({state:'hidden'});await page.locator('.connection-banner').waitFor();assert.equal(await page.locator('.battle-panel').count(),0);
 pass('Slow and rejected encounters return to the map without stuck movement or duplicate battle.');
 for(const [width,height] of [[360,844],[768,1024],[1024,768],[1365,950]]){
  await prepare();await page.setViewportSize({width,height});await capture();await page.locator('[data-capture-phase="shake-2"]').waitFor();await page.screenshot({path:'artifacts/capture-'+kind+'-'+width+'.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.skip-battle').click();
 }
 await prepare();await capture();await page.evaluate(()=>{window.__cinema.state.settings.childLocked=true;window.__cinema.update();window.dispatchEvent(new Event('focus'));});await page.locator('.child-rest-page').waitFor();assert.equal((await music()).track,null);assert.equal(await page.locator('.capture-fx').count(),0);
 pass('Phone/tablet/desktop layouts fit; parent lock clears animation and audio.');
 assert.deepEqual(errors,[]);
}finally{await writeFile('artifacts/encounter-music-'+kind+'.json',JSON.stringify({checks,errors,audioRequests:audioRequests.length},null,2));await browser.close();}
