// Synthetic saved game and transaction replay; no CloudBase authentication or writes.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState} from './server/state';import {execute} from './server/engine';
const rt={now:new Date('2026-10-19T04:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>0.3};
const saved=JSON.parse(localStorage.getItem('learning-fixture')||'null');
let state=saved?.state??execute(initialState([],rt.now,'测试训练师',''),{type:'starter',payload:{speciesId:25}},'child',rt).state,revision=saved?.revision??0,operations=saved?.operations??{},fail='',calls=[];
window.__learning={get state(){return state;},get revision(){return revision;},calls,fail:mode=>fail=mode,midnight:()=>rt.now=new Date('2026-10-20T04:00:00Z')};
export const auth={getSession:async()=>({data:{session:{user:{id:'learning-child'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(command){
 calls.push(command);
 if(fail==='before'&&command.type!=='bootstrap'){fail='';throw new Error('模拟网络中断');}
 let result=operations[command.operationId];
 if(!result){const next=execute(state,command,'child',rt);state=next.state;revision++;result=next.result;operations[command.operationId]=result;localStorage.setItem('learning-fixture',JSON.stringify({state,revision,operations}));}
 if(fail==='after'&&command.type!=='bootstrap'){fail='';throw new Error('模拟回包丢失');}
 return {ok:true,state:publicState(state,'child',revision,rt.now),result};
}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=s=>Object.values(s.mastery).filter(m=>m.due<=s.today).length;
`},bundle:true,write:false,platform:'browser',format:'esm'});
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('**/src/lib.ts',r=>r.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));await mkdir('artifacts',{recursive:true});
const next=()=>page.getByRole('button',{name:'下一题',exact:true});
async function answer(correct=true){const index=await page.evaluate(correct=>{const q=window.__learning.state.question;return q.options.findIndex(o=>(o.id===q.correctOptionId)===correct);},correct);await page.locator('.quiz-options button').nth(index).click();}
try{
 await page.goto((process.env.TEST_BASE_URL??'http://127.0.0.1:5173/')+'#/learning');await page.getByRole('button',{name:'开始今天的练习',exact:true}).click();
 await answer(false);await page.locator('.word-explanation').waitFor();await page.reload();await page.locator('.word-explanation').waitFor();await answer();await next().waitFor();
 assert.equal(await page.locator('.quiz-options').count(),0);assert.equal(await page.evaluate(()=>window.__learning.state.daily.correct),0);
 await page.screenshot({path:'artifacts/learning-feedback-tablet.png',fullPage:true});
 await page.evaluate(()=>window.__learning.fail('before'));await next().click();await page.getByRole('button',{name:'重试这一步',exact:true}).waitFor();assert.equal(await page.locator('.quiz-success').count(),1);await page.getByRole('button',{name:'重试这一步',exact:true}).click();await page.locator('.quiz-options').waitFor();
 const starts=await page.evaluate(()=>window.__learning.calls.filter(c=>c.type==='practice.start'));assert.equal(starts.at(-1).operationId,starts.at(-2).operationId);
 await page.evaluate(()=>window.__learning.fail('after'));await answer();await page.getByRole('button',{name:'重试这一步',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'重试未完成操作',exact:true}).click();await next().waitFor();assert.equal(await page.evaluate(()=>window.__learning.state.daily.questions),2);
 await page.getByRole('button',{name:'稍后继续',exact:true}).click();await page.locator('.quiz-dialog').waitFor({state:'hidden'});await page.getByRole('button',{name:'继续练习',exact:true}).click();await answer();await next().waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/learning-feedback-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(let i=3;i<10;i++){await next().click();await answer();await page.locator('.quiz-complete-actions').waitFor();}
 await page.getByRole('button',{name:'完成挑战',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__learning.state.daily.questions),10);assert.equal(await page.evaluate(()=>window.__learning.state.daily.correct),9);assert.equal(await next().count(),0);
 await page.screenshot({path:'artifacts/learning-complete-mobile.png',fullPage:true});await page.getByRole('button',{name:'完成挑战',exact:true}).click();assert(await page.getByRole('button',{name:'今日挑战完成',exact:true}).isDisabled());
 await page.getByRole('button',{name:'开始复习',exact:true}).click();await answer();await page.locator('.quiz-dialog').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS: continuous ten questions, correction and refresh, next retry, lost answer replay after refresh, pause/resume, mobile layout, completion, independent review.');
}finally{await browser.close();}
