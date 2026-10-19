// Deterministic browser checks with synthetic data only; never authenticates to CloudBase.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState} from './server/state';
import {execute} from './server/engine';
const rt={now:new Date('2026-10-19T04:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>0.3};
const npcs=[{id:'fixture-friend',name:'测试朋友',regionId:'home-meadow',x:10,y:10,kind:'family',line:'一起学习吧',quest:'单词挑战'}];
const saves={trial:{state:initialState(npcs,rt.now,'测试训练师','测试账号'),revision:0},own:{state:initialState(npcs,rt.now,'独立家庭',''),revision:100}};
let uid='trial-child',listeners=[],held=null,holdNext=false,failNext=false;
const calls=[];
const session=()=>uid?{user:{id:uid,is_anonymous:false}}:null;
const switchUser=next=>{uid=next;listeners.forEach(fn=>fn('SIGNED_IN',session()));};
window.__trialFixture={switchUser,calls,hold:()=>holdNext=true,fail:()=>failNext=true,release:()=>{held?.();held=null;},saves};
export const auth={getSession:async()=>({data:{session:session()},error:null}),onAuthStateChange:fn=>{listeners.push(fn);return {data:{subscription:{unsubscribe:()=>listeners=listeners.filter(x=>x!==fn)}}};},signOut:async()=>switchUser(null),signInWithPassword:async({username})=>{switchUser(username);return {data:{session:session()},error:null};}};
export async function request(command,expectedUid){
 if(expectedUid!==uid)throw new Error('账号已切换');
 const owner=uid,key=owner.startsWith('trial')?'trial':'own',role=owner.endsWith('parent')?'parent':'child',row=saves[key];
 calls.push({uid:owner,type:command.type,operationId:command.operationId});
 if(failNext&&command.type!=='bootstrap'){failNext=false;throw new Error('模拟断网');}
 const next=execute(row.state,command,role,rt);row.state=next.state;row.revision++;
 const response={ok:true,state:{...publicState(row.state,role,row.revision,rt.now),contentMode:key==='trial'?'follow':'own'},result:next.result};
 if(holdNext&&command.type!=='bootstrap'){holdNext=false;await new Promise(resolve=>held=resolve);}
 return response;
}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';
export const saveFile=()=>{};
export const dueWords=s=>Object.values(s.mastery).filter(m=>m.due<=s.today).length;
`},bundle:true,write:false,platform:'browser',format:'esm'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/lib.ts',route=>route.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
await mkdir('artifacts',{recursive:true});
try{
 await page.goto(process.env.TEST_BASE_URL??'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'测试训练师，选一位伙伴吧！'}).waitFor();
 assert.equal(await page.locator('.trial-banner').count(),1);
 await page.screenshot({path:'artifacts/trial-starter-desktop.png',fullPage:true});
 await page.evaluate(()=>window.__trialFixture.switchUser('own-parent'));
 await page.getByRole('heading',{name:'独立家庭，选一位伙伴吧！'}).waitFor();assert.equal(await page.locator('.trial-banner').count(),0);
 await page.evaluate(()=>window.__trialFixture.switchUser('trial-parent'));
 await page.getByRole('heading',{name:'测试训练师，选一位伙伴吧！'}).waitFor();
 await page.getByRole('button',{name:'先去家长空间'}).click();
 await page.getByRole('button',{name:'家庭规则',exact:true}).click();
 assert.equal(await page.locator('.parent-config input:enabled').count(),0);assert(await page.getByRole('button',{name:'保存家庭规则'}).isDisabled());
 await page.screenshot({path:'artifacts/trial-parent-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'英语词库',exact:true}).click();await page.getByPlaceholder('搜索单词或词义').fill('apple');
 assert(await page.getByRole('button',{name:'添加单词'}).isDisabled());assert.equal(await page.getByText('导入 CSV',{exact:true}).count(),0);
 await page.getByRole('button',{name:'家人与同学',exact:true}).click();await page.getByRole('heading',{name:'查看朋友'}).waitFor();assert(await page.getByRole('button',{name:'保存这位朋友'}).isDisabled());
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/trial-parent-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1024,height:768});
 await page.evaluate(()=>{location.hash='/adventure';window.__trialFixture.switchUser('trial-child');});
 await page.getByRole('heading',{name:'测试训练师，选一位伙伴吧！'}).waitFor();
 await page.evaluate(()=>window.__trialFixture.hold());await page.getByRole('button',{name:'就决定是你了，皮卡丘！',exact:true}).click();
 await page.evaluate(()=>window.__trialFixture.switchUser('own-parent'));
 await page.getByRole('heading',{name:'独立家庭，选一位伙伴吧！'}).waitFor();
 await page.evaluate(()=>window.__trialFixture.release());await page.waitForTimeout(150);
 assert.equal(await page.locator('.trial-banner').count(),0);assert.equal(await page.locator('.toast').count(),0);
 assert(await page.evaluate(()=>!!localStorage.getItem('rr-pending-trial-child')));
 await page.evaluate(()=>window.__trialFixture.switchUser('trial-child'));
 await page.locator('.world-canvas canvas').waitFor();await page.getByRole('button',{name:'重试未完成操作'}).waitFor();
 // The fixture's command engine intentionally lacks transaction replay: verify request routing, not the synthetic result.
 await page.getByRole('button',{name:'重试未完成操作'}).click();
 await page.waitForFunction(()=>window.__trialFixture.calls.filter(c=>c.type==='starter').length===2);
 const starterCalls=await page.evaluate(()=>window.__trialFixture.calls.filter(c=>c.type==='starter'));
 assert(starterCalls.every(c=>c.uid==='trial-child'));assert.equal(starterCalls[0].operationId,starterCalls[1].operationId);
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop/tablet/mobile identity banner, read-only parent configuration and searchable words, direct account switching, stale response isolation, UID-scoped pending retry.');
}finally{await browser.close();}
