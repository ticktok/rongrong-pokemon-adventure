import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {apiKey}=JSON.parse(await readFile('private/server.json')),families=JSON.parse(await readFile('private/family-seed.json'));
const account=JSON.parse(await readFile('private/account-identities.json')).find(a=>a.username==='rongrong-qa-child');
async function state(){const r=await fetch('https://wind-d7gesdlb779f8214f.api.tcloudbasegateway.com/v1/rdb/rest/rr_saves?select=state,revision&family_id=eq.'+families.qa,{headers:{Authorization:'Bearer '+apiKey}});return (await r.json())[0];}
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({storageState:'private/qa-browser-state.json',viewport:{width:1024,height:768}}),page=await context.newPage();page.setDefaultTimeout(90000);
const checks=[];
try{
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5173/')+'#/learning');
 const notice=page.getByRole('button',{name:/^确定访问/});if(await notice.count())await notice.click();
 await page.locator('.learning-grid,.login-form-panel').first().waitFor();
 if(await page.locator('.login-form-panel').count()){await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();}
 await page.getByRole('button',{name:'学习手册',exact:true}).waitFor();await page.getByRole('button',{name:'学习手册',exact:true}).click();await page.locator('.learning-grid').waitFor();
 const current=await state();
 if(!current.state.question){
   const daily=page.getByRole('button',{name:/^(开始今天的练习|继续练习)$/});await daily.click();
 }
 await page.locator('.quiz-dialog').waitFor();
 const before=await state();
 await context.setOffline(true);await page.locator('.quiz-options button').first().click();
 await page.getByRole('button',{name:'重试这一步',exact:true}).waitFor();assert.equal((await state()).revision,before.revision);
 const pending=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),'rr-pending-'+account.uid);
 assert.equal(pending.type,'answer');checks.push('Offline answer stays pending without changing the cloud save');
 assert((await page.locator('.cloud-state').innerText()).includes('待重试'));checks.push('Header reports pending state rather than synced');
 await page.screenshot({path:'artifacts/quiz-offline.png',fullPage:true});
 await context.setOffline(false);await page.getByRole('button',{name:'重试这一步',exact:true}).click();
 await page.waitForFunction(key=>localStorage.getItem(key)===null,'rr-pending-'+account.uid);
 const after=await state();assert.equal(after.revision,before.revision+1);checks.push('Retry inside the quiz settles the original answer exactly once');
 if(after.state.question){const q=after.state.question;await page.locator('.quiz-options button').nth(q.options.findIndex(o=>o.id===q.correctOptionId)).click();await page.locator('.quiz-dialog').waitFor({state:'hidden'});}
 await page.getByRole('button',{name:'去冒险',exact:true}).click();await page.locator('.world-canvas canvas').waitFor();checks.push('Adventure can resume after recovery and correction');
 checks.forEach(x=>console.log('PASS',x));
}catch(e){checks.push('FAILED: '+e);console.error(e);process.exitCode=1;}
finally{await writeFile('artifacts/quiz-recovery.json',JSON.stringify(checks,null,2));await browser.close();}
