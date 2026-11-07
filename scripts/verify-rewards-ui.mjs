// Synthetic state and roles only. No cloud calls or real family data.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState} from './server/state';import {execute} from './server/engine';
const rt={now:new Date('2026-10-19T10:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>.3};
function fresh(){const s=execute(initialState([],rt.now,'测试训练师'),{type:'starter',payload:{speciesId:25}},'child',rt).state;s.settings.tasks=['语文练习','数学练习','英语练习','阅读','整理书包'].map((name,i)=>({id:'t'+i,name,active:true}));return s;}
let s=JSON.parse(sessionStorage.getItem('feature-state')||'null')??fresh(),role=sessionStorage.getItem('feature-role')??'child',revision=0;
const results=new Map(),flags={loseResponse:false};
const persist=()=>{sessionStorage.setItem('feature-state',JSON.stringify(s));sessionStorage.setItem('feature-role',role);};
const act=(type,payload,as='child')=>{s=execute(s,{type,payload},as,rt).state;persist();};
window.__features={get state(){return s;},flags,setRole(value){role=value;persist();},prepare(partial=false){s=fresh();act('checkin.submit',{taskIds:['t0','t1','t2','t3','t4']});if(partial)act('parent.review',{date:s.daily.date,approvedTaskIds:['t0','t1'],submissionVersion:1,reason:'完成后今天再交'},'parent');persist();}};
export const auth={getSession:async()=>({data:{session:{user:{id:'feature-fixture'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(command){
 if(!navigator.onLine)throw new Error('网络断开了');
 if(results.has(command.operationId))return {...results.get(command.operationId),state:publicState(s,role,revision,rt.now)};
 try{const next=execute(s,command,role,rt);s=next.state;revision++;persist();const response={ok:true,state:publicState(s,role,revision,rt.now),result:next.result};results.set(command.operationId,response);if(flags.loseResponse){flags.loseResponse=false;throw new TypeError('模拟保存后响应丢失');}return response;}catch(error){if(error instanceof TypeError)throw error;return {ok:false,error:error.message};}
}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=s=>s.reviewCount;
`},bundle:true,write:false,platform:'browser',format:'esm'});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
await page.route('**/src/lib.ts',route=>route.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
await mkdir('artifacts',{recursive:true});
const state=()=>page.evaluate(()=>window.__features.state);
async function role(value){await page.evaluate(value=>window.__features.setRole(value),value);await page.goto(base+'#/'+(value==='parent'?'parent':'learning'));await page.reload();await page.locator(value==='parent'?'.parent-page':'.learning-grid').waitFor();}
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5176/';
function pass(value){checks.push(value);console.log('PASS',value);}
try{
 await page.goto(base+'#/learning');await page.locator('.daily-tasks').waitFor();
 for(const name of ['语文练习','数学练习','英语练习'])await page.locator('.daily-tasks').getByRole('checkbox',{name:new RegExp(name)}).check();
 await page.getByRole('button',{name:'提交 3 项任务',exact:true}).click();await page.getByRole('button',{name:'等待家长确认',exact:true}).waitFor();
 await role('parent');await page.getByRole('checkbox',{name:'通过英语练习',exact:true}).uncheck();await page.getByRole('textbox',{name:'给孩子的留言'}).fill('英语练习再检查一下');
 await page.getByRole('button',{name:'通过 2 项，退回 1 项',exact:true}).click();await page.getByText('今天没有待审核的打卡').waitFor();assert.equal((await state()).checkins[0].review.settled,110);
 await role('child');assert.equal(await page.locator('.task-approved').count(),2);assert.match(await page.locator('.task-rejected').innerText(),/英语练习再检查一下/);assert.equal(await page.locator('.task-approved input').first().isDisabled(),true);
 for(const name of ['英语练习','阅读','整理书包'])await page.locator('.daily-tasks').getByRole('checkbox',{name:new RegExp(name)}).check();
 await page.getByRole('button',{name:'提交 3 项任务',exact:true}).click();await page.getByRole('button',{name:'等待家长确认',exact:true}).waitFor();
 await role('parent');await page.evaluate(()=>window.__features.flags.loseResponse=true);await page.getByRole('button',{name:'通过 3 项，退回 0 项',exact:true}).click();await page.getByRole('button',{name:'重试',exact:true}).waitFor();
 assert.equal((await state()).checkins[0].review.settled,276);await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByText('今天没有待审核的打卡').waitFor();assert.equal((await state()).checkins[0].review.settled,276);assert.equal((await state()).daily.expGranted,276);
 pass('Child submits; parent passes two items; child retains approvals and resubmits the rest; lost response retry does not pay twice.');
 await page.getByRole('button',{name:'存档与记录',exact:true}).click();assert.match(await page.locator('.itemized-history').innerText(),/奖励共 276 基础经验/);
 await role('child');await page.getByRole('button',{name:'开始今天的练习',exact:true}).click();
 for(let i=0;i<10;i++){
  await page.locator('.quiz-options button').first().waitFor();const s=await state();const index=s.question.options.findIndex(o=>o.id===s.question.correctOptionId);await page.locator('.quiz-options button').nth(index).click();
  await page.locator('.quiz-complete-actions').waitFor();if(i<9)await page.getByRole('button',{name:'下一题',exact:true}).click();
 }
 assert.equal((await state()).checkins[0].review.settled,322);assert.equal((await state()).daily.expGranted,320);assert.equal((await state()).sharedRewards.reduce((n,r)=>n+r.base,0),2);assert.match(await page.locator('.quiz-reward').innerText(),/顺延/);await page.getByRole('button',{name:'完成挑战',exact:true}).click();
 pass('English completed after approval tops up to 322 total; 320 arrives and two points carry, with visible feedback.');
 for(const width of [360,768,1024,1365]){
  await page.setViewportSize({width,height:width<500?844:950});await page.evaluate(()=>window.__features.prepare());await role('parent');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Parent overflow '+width);
  assert(await page.locator('.review-task').first().evaluate(e=>e.getBoundingClientRect().height>=44));
  await page.screenshot({path:'artifacts/rewards-parent-'+width+'.png',fullPage:true,animations:'disabled'});
  await page.evaluate(()=>window.__features.prepare(true));await role('child');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Child overflow '+width);
  await page.locator('.daily-tasks').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/rewards-child-'+width+'.png',fullPage:true,animations:'disabled'});
 }
 pass('Parent and child task cards work at 360, 768, 1024 and 1365 pixels, with touch targets and no horizontal overflow.');
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/rewards-ui-report.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
