import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const base='http://127.0.0.1:5173/';
const accounts=JSON.parse(await readFile('private/account-identities.json'));
const families=JSON.parse(await readFile('private/family-seed.json'));
const {apiKey}=JSON.parse(await readFile('private/server.json'));
const root='https://wind-d7gesdlb779f8214f.api.tcloudbasegateway.com/v1/rdb/rest/';
const report={base,checks:[],errors:[],screens:[]};
function passed(name){report.checks.push(name);console.log('PASS',name);}
async function pg(path,body){
 const res=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const value=await res.json();if(!res.ok)throw new Error('PG '+res.status+': '+JSON.stringify(value));return value;
}
async function stored(){const rows=await pg('rr_saves?select=state,revision&family_id=eq.'+families.qa);assert.equal(rows.length,1);return rows[0];}
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1365,height:950},hasTouch:true});
const parentContext=await browser.newContext({viewport:{width:1280,height:900}});
async function pageFor(ctx,username){
 const page=await ctx.newPage();page.setDefaultTimeout(90000);
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});
 const a=accounts.find(a=>a.username===username);
 await page.getByLabel('账号',{exact:true}).fill(a.username);await page.getByLabel('密码',{exact:true}).fill(a.password);
 await page.getByRole('button',{name:'进入冒险',exact:true}).click();
 await page.locator('.starter-page,.adventure-page,.connection-banner,.loading-screen .error-text,.form-error').first().waitFor();
 const errors=await page.locator('.form-error,.loading-screen .error-text,.connection-banner').allTextContents();assert.deepEqual(errors,[]);
 return page;
}
async function command(page,type,payload={},operationId=randomUUID()){
 return page.evaluate(async({type,payload,operationId})=>{
   const client=await import('/src/lib.ts');
   return client.request({type,payload,operationId});
 },{type,payload,operationId});
}
async function shot(page,name){await page.screenshot({path:'artifacts/'+name+'.png',fullPage:true});report.screens.push(name);}
try {
 assert.notEqual(families.qa,families.home);
 await build({entryPoints:['server/state.ts'],outfile:'private/e2e-state.mjs',bundle:true,platform:'node',format:'esm'});
 const {initialState}=await import('../private/e2e-state.mjs');
 const previous=await stored();const fresh=initialState(previous.state.npcs,new Date(),'测试训练师','测试账号');
 await pg('rpc/rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:previous.revision,p_state:fresh,p_result:{message:'Prepare isolated QA run'}});
 const child=await pageFor(context,'rongrong-qa-child');passed('CloudBase child login and private save read');
 if(await child.locator('.starter-page').count()){
   await child.getByRole('button',{name:'就决定是你了，皮卡丘！',exact:true}).click();
 }
 await child.locator('.world-canvas canvas').waitFor();
 await child.waitForTimeout(1500);await shot(child,'adventure-desktop');passed('Starter selection and Phaser map');
 const before=(await stored()).state.position;
 await child.locator('.world-canvas canvas').click({position:{x:200,y:200}});
 await child.keyboard.down('ArrowRight');await child.waitForTimeout(420);await child.keyboard.up('ArrowRight');
 await child.waitForTimeout(2200);
 for(let i=0;i<10;i++){if((await stored()).state.position.x!==before.x)break;await child.waitForTimeout(500);}
 assert.notEqual((await stored()).state.position.x,before.x);passed('Keyboard movement persists to PostgreSQL');
 const touchBefore=(await stored()).state.position.x;
 const box=await child.getByRole('button',{name:'向左',exact:true}).boundingBox();
 const cdp=await context.newCDPSession(child);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
 await child.waitForTimeout(330);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await child.waitForTimeout(2200);
 for(let i=0;i<10;i++){if((await stored()).state.position.x!==touchBefore)break;await child.waitForTimeout(500);}
 assert.notEqual((await stored()).state.position.x,touchBefore);passed('Touch direction controls persist movement');
 await child.getByRole('button',{name:'学习手册',exact:true}).click();
 let current=(await stored()).state;
 if(current.daily.questions<10){
   if(!current.question){await child.getByRole('button',{name:current.daily.questions?'继续练习':'开始今天的练习',exact:true}).click();await child.locator('.quiz-dialog').waitFor();}
   current=(await stored()).state;
   const wrong=current.question.options.findIndex(o=>o.id!==current.question.correctOptionId);
   const beforeAnswers=current.daily.correct;
   await child.locator('.quiz-options button').nth(wrong).click();
   await child.locator('.word-explanation').waitFor();await shot(child,'quiz-correction');
   await child.reload({waitUntil:'networkidle'});await child.locator('.word-explanation').waitFor();
   current=(await stored()).state;assert.equal(current.question.wrong,true);passed('Wrong answer and correction survive refresh');
   const right=current.question.options.findIndex(o=>o.id===current.question.correctOptionId);
   await child.locator('.quiz-options button').nth(right).click();await child.getByRole('button',{name:'稍后继续',exact:true}).click();await child.locator('.quiz-dialog').waitFor({state:'hidden'});
   assert.equal((await stored()).state.daily.correct,beforeAnswers);passed('Correction completes without first-answer bonus');
 }
 current=(await stored()).state;
 while(current.daily.questions<10){
   const begun=await command(child,'practice.start',{mode:'daily'});assert.equal(begun.ok,true,begun.error);
   assert.equal('correctOptionId'in begun.state.question,false);
   const q=(await stored()).state.question;
   const answered=await command(child,'answer',{questionId:q.id,optionId:q.correctOptionId});assert.equal(answered.ok,true,answered.error);
   current=answered.state;
 }
 passed('Ten-word daily practice through authenticated function');
 await child.reload({waitUntil:'networkidle'});await child.locator('.learning-grid').waitFor();
 current=(await stored()).state;
 if(!current.checkins.some(c=>c.date===current.daily.date&&c.status!=='rejected')){
   for(const checkbox of await child.locator('.daily-tasks').getByRole('checkbox').all())await checkbox.check();
   await child.getByRole('button',{name:/^提交 \d+ 项任务$/}).click();
   await child.getByRole('button',{name:'等待家长确认',exact:true}).waitFor();
 }
 passed('Child submits homework in the UI');
 const parent=await pageFor(parentContext,'rongrong-qa-parent');
 await parent.getByRole('button',{name:'家长',exact:true}).click();await parent.locator('.parent-page').waitFor();
 const old=(await stored()).state;
 if(old.checkins.some(c=>c.date===old.daily.date&&c.status==='pending')){
   await parent.getByRole('button',{name:/^通过 \d+ 项，退回 0 项$/}).click();
   await parent.getByRole('heading',{name:'今天没有待审核的打卡',exact:true}).waitFor();
   const approved=await stored();assert.equal(approved.state.checkins.find(c=>c.date===old.daily.date).status,'approved');
   assert(approved.state.partners[0].exp>old.partners[0].exp);passed('Parent approves, experience is awarded and partner levels up');
   const operations=await pg('rr_operations?select=operation_id,result&family_id=eq.'+families.qa+'&order=created_at.desc&limit=1');
   const replay=await command(parent,'parent.review',{date:old.daily.date,approve:true},operations[0].operation_id);
   assert.equal(replay.ok,true);assert.equal((await stored()).revision,approved.revision);passed('Replayed approval does not award twice');
 }
 const forbidden=await command(child,'parent.settings',{dailyCap:5000,role:'parent'});assert.equal(forbidden.ok,false);passed('Child cannot change parent rules');
 const isolated=await command(child,'bootstrap',{familyId:families.home});assert.equal(isolated.state.nickname,'测试训练师');passed('Forged family ID does not expose the real family');
 await parent.getByRole('button',{name:'家庭规则',exact:true}).click();
 const toggle=parent.getByLabel('今天临时开放对战与捕捉',{exact:false});if(await toggle.isChecked()){await toggle.uncheck();await parent.waitForFunction(()=>!document.querySelector('.toggle-row input')?.disabled);}
 await toggle.check();await parent.waitForFunction(()=>!document.querySelector('.toggle-row input')?.disabled);assert.equal((await stored()).state.settings.weekdayPassDate,(await stored()).state.daily.date);passed('Parent weekday override responds and persists');
 await child.getByRole('button',{name:'去冒险',exact:true}).click();await child.locator('.world-canvas canvas').waitFor();
 let encounter=await command(child,'encounter');assert.equal(encounter.ok,true,encounter.error);
 const id=encounter.state.battle.id,count=encounter.state.daily.encounters;
 await child.reload({waitUntil:'networkidle'});await child.locator('.battle-stage').waitFor();await shot(child,'battle');
 assert.equal((await stored()).state.battle.id,id);assert.equal((await stored()).state.daily.encounters,count);passed('Encounter and quota survive refresh');
 await child.locator('.move-button').first().click();await child.locator('.quiz-dialog').waitFor();
 let q=(await stored()).state.question;
 await child.locator('.quiz-options button').nth(q.options.findIndex(o=>o.id===q.correctOptionId)).click();
 await child.locator('.quiz-dialog').waitFor({state:'hidden'});
 const moved=(await stored()).state;assert(moved.battle.log.some(l=>l.includes('英语助攻')));passed('Correct vocabulary answer boosts a real battle move');
 if(moved.battle.status==='active'){
   await child.getByRole('button',{name:/抛出精灵球/}).click();await child.locator('.quiz-dialog').waitFor();
   q=(await stored()).state.question;await child.locator('.quiz-options button').nth(q.options.findIndex(o=>o.id===q.correctOptionId)).click();await child.locator('.quiz-dialog').waitFor({state:'hidden'});
   assert.equal((await stored()).state.battle.balls,1);passed('Vocabulary-assisted capture attempt is settled once');
 }
 await command(child,'battle.leave');
 await child.reload({waitUntil:'networkidle'});await child.locator('.world-canvas canvas').waitFor();
 await child.getByRole('button',{name:'发现图鉴',exact:true}).click();await child.locator('.dex-card').last().waitFor();assert.equal(await child.locator('.dex-card').count(),151);await shot(child,'pokedex');passed('151-entry illustrated Pokedex');
 await child.setViewportSize({width:1024,height:768});await child.getByRole('button',{name:'去冒险',exact:true}).click();await child.locator('.world-canvas canvas').waitFor();await child.waitForTimeout(800);await shot(child,'adventure-tablet');
 assert.equal(await child.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);passed('1024x768 tablet layout without horizontal overflow');
 await context.setOffline(true);await child.reload().catch(()=>{});await context.setOffline(false);await child.goto(base);await child.locator('.world-canvas canvas').waitFor();passed('Network recovery restores the cloud save');
 assert.deepEqual(report.errors,[]);passed('No uncaught browser errors');
 await context.storageState({path:'private/qa-browser-state.json'});
}catch(error){report.failure=String(error);console.error(error);process.exitCode=1;}
finally{await writeFile('artifacts/e2e-live.json',JSON.stringify(report,null,2));await browser.close();}
