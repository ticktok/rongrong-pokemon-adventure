import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadOps,settings} from './ops-lib.mjs';
const base=JSON.parse(await readFile('deployment.json','utf8')).url;
const {BackupStore,validateSave,wordBank,execute}=await loadOps();
const {envId,apiKey,version}=await settings();
const family=JSON.parse(await readFile('private/family-seed.json','utf8')).home;
const store=new BackupStore(envId,apiKey),before=await store.currentFamily(family);
const expected=execute(before.state,{type:'bootstrap',payload:{},operationId:randomUUID()},'child',{now:new Date(),uuid:randomUUID,random:()=>0.5}).state;
const accounts=JSON.parse(await readFile('private/account-identities.json'));

const browser=await chromium.launch({channel:'chrome',headless:true});
const report={url:base,checks:[],errors:[]};
async function login(username,hash){
 const context=await browser.newContext({viewport:{width:1280,height:850}});
 const page=await context.newPage();page.setDefaultTimeout(90000);
 page.on('pageerror',e=>report.errors.push(e.message));
 const response=await page.goto(base+(hash??''),{waitUntil:'networkidle'});
 if(response.status()===404&&await page.getByRole('button',{name:/^确定访问/}).count()){await page.getByRole('button',{name:/^确定访问/}).click();await page.getByLabel('账号',{exact:true}).waitFor();}else assert.equal(response.status(),200);
 if(hash&&!page.url().endsWith(hash)){await page.goto(base+hash);await page.getByLabel('账号',{exact:true}).waitFor();}
 const a=accounts.find(a=>a.username===username);
 await page.getByLabel('账号',{exact:true}).fill(a.username);await page.getByLabel('密码',{exact:true}).fill(a.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();
 return {page,context};
}
function pass(message){report.checks.push(message);console.log('PASS',message);}
try{
 const {page:child,context:cc}=await login('rongrong','');
 await child.locator(expected.started?'.adventure-page':'.starter-page').waitFor();
 if(!expected.started)assert.equal(await child.locator('.starter-card').count(),4);
 assert.equal(await child.locator('.app-footer').innerText().then(text=>text.includes('v'+version)),true);
 pass('Production HTTPS login and current save screen at v'+version);
 await child.screenshot({path:'artifacts/production-starter.png',fullPage:true});
 await child.reload({waitUntil:'networkidle'});await child.locator(expected.started?'.adventure-page':'.starter-page').waitFor();pass('Production child session survives refresh');
 await cc.close();
 const {page:parent,context:pc}=await login('rongrong-parent','#/parent');
 await parent.locator('.parent-page').waitFor();pass('Production parent deep link opens protected management before starter selection');
 await parent.getByRole('button',{name:'家人与同学',exact:true}).click();assert.equal(await parent.locator('.npc-list>button').count(),expected.npcs.length);pass('Saved NPC identities read back from production');
 await parent.getByRole('button',{name:'英语词库',exact:true}).click();await parent.locator('tbody tr').last().waitFor();assert.equal(await parent.locator('tbody tr').count(),wordBank(expected).length);pass('Current vocabulary entries read back from production');
 await parent.getByRole('button',{name:'存档与记录',exact:true}).click();
 const downloaded=parent.waitForEvent('download');await parent.getByRole('button',{name:'导出家庭存档',exact:true}).click();const file=await downloaded;await file.saveAs('private/production-family-export.json');
 const save=JSON.parse(await readFile('private/production-family-export.json'));validateSave(save);assert.deepEqual(save,expected);pass('Production export preserves current family progress including pending actions');
 await pc.close();
 const after=await store.currentFamily(family);validateSave(after.state);assert.deepEqual(after.state,expected);
 pass('Formal save readback matches expected progress (including normal rollover)');
 for(const path of ['assets/pokemon/art/1.png','assets/pokemon/art/151.png','assets/pokemon/back/25.png','manifest.webmanifest','licenses/noto-sans-sc-LICENSE',...Array.from({length:18},(_,i)=>'assets/pokemon/types/'+(i+1)+'.png')]){
  const r=await fetch(base+path,{signal:AbortSignal.timeout(20000)});assert(r.ok,path+' HTTP '+r.status);
 }
 pass('Production sprites, manifest and font license URLs are reachable');
 assert.deepEqual(report.errors,[]);pass('No uncaught errors on production routes');
}catch(error){report.failure=String(error);console.error(error);process.exitCode=1;}
finally{await writeFile('artifacts/production-checks.json',JSON.stringify(report,null,2));await browser.close();}
