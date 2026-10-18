import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://rongrong-pokemon-adventure-wind-d7gesdlb779f8214f.webapps.tcloudbase.com/';
const accounts=JSON.parse(await readFile('private/account-identities.json'));
const profile=JSON.parse(await readFile('private/profile.json'));
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
 await child.getByRole('heading',{name:'融融，选一位伙伴吧！',exact:true}).waitFor();assert.equal(await child.locator('.starter-card').count(),4);
 pass('Production HTTPS child login and pristine four-starter choice');
 await child.screenshot({path:'artifacts/production-starter.png',fullPage:true});
 await child.reload({waitUntil:'networkidle'});await child.getByRole('heading',{name:'融融，选一位伙伴吧！',exact:true}).waitFor();pass('Production child session survives refresh');
 await cc.close();
 const {page:parent,context:pc}=await login('rongrong-parent','#/parent');
 await parent.locator('.parent-page').waitFor();pass('Production parent deep link opens protected management before starter selection');
 await parent.getByRole('button',{name:'家人与同学',exact:true}).click();assert.equal(await parent.locator('.npc-list>button').count(),40);pass('40 private family and classmate NPCs read back from production');
 await parent.getByRole('button',{name:'英语词库',exact:true}).click();await parent.locator('tbody tr').last().waitFor();assert.equal(await parent.locator('tbody tr').count(),300);pass('300 editable vocabulary entries read back from production');
 await parent.getByRole('button',{name:'存档与记录',exact:true}).click();
 const downloaded=parent.waitForEvent('download');await parent.getByRole('button',{name:'导出家庭存档',exact:true}).click();const file=await downloaded;await file.saveAs('private/production-family-export.json');
 const save=JSON.parse(await readFile('private/production-family-export.json'));assert.equal(save.started,false);assert.equal(save.realName,profile.realName);assert.equal(save.npcs.length,40);pass('Production parent export contains the correct untouched family save');
 await pc.close();
 for(const path of ['assets/pokemon/art/1.png','assets/pokemon/art/151.png','assets/pokemon/back/25.png','manifest.webmanifest','licenses/noto-sans-sc-LICENSE']){
  const r=await fetch(base+path,{signal:AbortSignal.timeout(20000)});assert(r.ok,path+' HTTP '+r.status);
 }
 pass('Production sprites, manifest and font license URLs are reachable');
 assert.deepEqual(report.errors,[]);pass('No uncaught errors on production routes');
}catch(error){report.failure=String(error);console.error(error);process.exitCode=1;}
finally{await writeFile('artifacts/production-checks.json',JSON.stringify(report,null,2));await browser.close();}
