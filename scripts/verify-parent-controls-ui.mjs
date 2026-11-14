// Synthetic dual-session checks: no CloudBase credentials or real saves.
import {chromium,webkit,expect} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState} from './server/state';import {execute} from './server/engine';import {gameCommand} from './server/game-service';import {PgError} from './server/pg';
const rt={now:new Date('2026-11-14T04:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>.3};
const role=new URLSearchParams(location.search).get('role')==='parent'?'parent':'child';
const get=()=>JSON.parse(localStorage.getItem('controls-fixture'));
const save=row=>localStorage.setItem('controls-fixture',JSON.stringify(row));
const flags={offline:false,loseResponse:false,delayResponse:0};
function prepare(kind='practice'){
 let s=execute(initialState([],rt.now,'测试训练师'),{type:'starter',payload:{speciesId:25}},'child',rt).state;
 if(kind==='practice')s=execute(s,{type:'practice.start',payload:{}},'child',rt).state;
 if(kind==='battle'){s.partners[0].moves=['normal-0'];s=execute(s,{type:'gym.start',payload:{}},'child',rt).state;s.battle.enemyHp=1000;s.battle.enemyMaxHp=1000;}
 save({state:s,revision:(get()?.revision??0)+1});localStorage.setItem('controls-operations','{}');
}
if(!get())prepare();
const db={async one(table,_columns,filters){if(table==='rr_members')return {family_id:'synthetic',role:filters.uid};if(table==='rr_saves')return get();const r=JSON.parse(localStorage.getItem('controls-operations'))[filters.operation_id];return r?{result:r}:null;},async rpc(_name,p){const row=get();if(row.revision!==p.p_revision)throw new PgError('REVISION_CONFLICT','40001');const next={state:p.p_state,revision:row.revision+1};save(next);const ops=JSON.parse(localStorage.getItem('controls-operations'));ops[p.p_operation]=p.p_result;localStorage.setItem('controls-operations',JSON.stringify(ops));return {...next,result:p.p_result};}};
window.__controls={get,prepare,flags};
export const auth={getSession:async()=>({data:{session:{user:{id:role}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(command){if(flags.offline)throw new Error('网络断开了');const response=await gameCommand(command,role,db,rt);if(command.type!=='state.read'&&command.type!=='bootstrap'){if(flags.loseResponse){flags.loseResponse=false;throw new Error('模拟响应丢失');}if(flags.delayResponse){const delay=flags.delayResponse;flags.delayResponse=0;await new Promise(r=>setTimeout(r,delay));}}return response;}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=s=>s.reviewCount;
`},bundle:true,write:false,platform:'browser',format:'esm'});
const useWebkit=process.env.TEST_BROWSER==='webkit';const browser=await(useWebkit?webkit:chromium).launch(useWebkit?{headless:true}:{channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1365,height:950},serviceWorkers:'block'}),child=await context.newPage(),parent=await context.newPage(),checks=[],errors=[];
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5176/';
for(const page of [child,parent]){page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));}
await context.route('**/src/lib.ts',r=>r.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
await mkdir('artifacts',{recursive:true});
const pass=message=>{checks.push(message);console.log('PASS',message);};
const row=()=>child.evaluate(()=>window.__controls.get());
const sync=()=>child.evaluate(()=>window.dispatchEvent(new Event('focus')));
async function lock(value){await parent.getByRole('checkbox',{name:'锁定儿童端'}).setChecked(value);await expect(parent.getByRole('checkbox',{name:'锁定儿童端'})).toBeChecked({checked:value});}
try{
 await child.goto(base+'?role=child#/learning');await child.locator('.quiz-options').waitFor();
 await parent.goto(base+'?role=parent#/parent');await parent.getByRole('button',{name:'家庭规则',exact:true}).click();
 await expect(parent.getByLabel('道馆难度系数')).toHaveValue('1.5');await parent.getByLabel('道馆难度系数').fill('2');await parent.getByRole('button',{name:'保存难度',exact:true}).click();await expect(parent.getByRole('button',{name:'保存难度',exact:true})).toBeDisabled();assert.equal((await row()).state.settings.gymDifficulty,2);
 const q=(await row()).state.question;await lock(true);await child.locator('.child-rest-page').waitFor();assert.equal(await child.locator('.quiz-options').count(),0);const locked=await row();await sync();await expect.poll(async()=>(await row()).revision).toBe(locked.revision);
 await child.screenshot({path:'artifacts/parent-controls-rest-desktop.png'});await parent.screenshot({path:'artifacts/parent-controls-desktop.png',fullPage:true});pass('Parent saves difficulty; an already open child session locks through polling and read-only sync leaves revision unchanged.');
 await child.evaluate(()=>window.__controls.flags.offline=true);await lock(false);await sync();await expect(child.getByRole('alert')).toContainText('网络断开');assert.equal(await child.locator('.child-rest-page').count(),1);
 await child.evaluate(()=>{window.__controls.flags.offline=false;window.dispatchEvent(new Event('online'));});await child.locator('.quiz-options').waitFor();assert.equal((await row()).state.question.id,q.id);pass('Offline child stays locked; reconnect fetches the unlocked state and resumes the exact question.');
 await child.evaluate(()=>window.__controls.flags.loseResponse=true);await child.locator('.quiz-options button').nth(q.options.findIndex(o=>o.id===q.correctOptionId)).click();await expect(child.locator('.connection-banner')).toContainText('模拟响应丢失');
 assert(await child.evaluate(()=>!!localStorage.getItem('rr-pending-child')));await lock(true);await sync();await child.locator('.child-rest-page').waitFor();assert(await child.evaluate(()=>!!localStorage.getItem('rr-pending-child')));await lock(false);await sync();await child.locator('.app-shell').waitFor();await child.getByRole('button',{name:'重试',exact:true}).click();await expect.poll(()=>child.evaluate(()=>localStorage.getItem('rr-pending-child'))).toBeNull();assert.equal((await row()).state.daily.questions,1);pass('Lost-response operation survives lock/unlock and retry commits no duplicate answer.');
 await child.waitForLoadState('networkidle');await child.evaluate(()=>{window.__controls.prepare('battle');history.replaceState(null,'','?role=child#/adventure');});await child.reload();await child.locator('.battle-panel').waitFor();
 // Delay the action response until after a newer lock read has arrived.
 await child.evaluate(()=>window.__controls.flags.delayResponse=3000);await child.getByRole('button',{name:/撞击/}).click();await expect.poll(async()=>!!(await row()).state.question).toBe(true);await lock(true);await sync();await child.locator('.child-rest-page').waitFor();await child.waitForTimeout(3300);assert.equal(await child.locator('.child-rest-page').count(),1);assert.equal(await child.locator('.quiz-options').count(),0);pass('A delayed pre-lock response cannot reopen gameplay or its question.');
 await lock(false);await sync();await child.locator('.quiz-options').waitFor();const bq=(await row()).state.question;await child.locator('.quiz-options button').nth(bq.options.findIndex(o=>o.id===bq.correctOptionId)).click();await expect.poll(async()=>!(await row()).state.question).toBe(true);await lock(true);await sync();await child.locator('.child-rest-page').waitFor();assert.equal(await child.locator('.battle-panel').count(),0);pass('Lock dismisses battle presentation; the settled battle remains in the save.');
 await parent.setViewportSize({width:1024,height:768});await parent.screenshot({path:'artifacts/parent-controls-ipad.png',fullPage:true});await child.setViewportSize({width:1024,height:768});await child.screenshot({path:'artifacts/parent-controls-rest-ipad.png'});
 for(const page of [parent,child]){await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}pass('Desktop, iPad-sized and narrow layouts render without horizontal overflow.');
 assert.deepEqual(errors,[]);
}finally{await writeFile('artifacts/parent-controls-ui-'+(useWebkit?'webkit':'chrome')+'.json',JSON.stringify({checks,errors},null,2));await browser.close();}
