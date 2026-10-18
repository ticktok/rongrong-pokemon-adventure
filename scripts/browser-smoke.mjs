import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const accounts=JSON.parse(await readFile('private/account-identities.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1365,height:950},deviceScaleFactor:1});
const page=await context.newPage();
const network=[];page.on('response',r=>{if(r.url().includes('cloudbase')||r.url().includes('tencentcloudapi'))network.push({path:new URL(r.url()).pathname,status:r.status()});});page.on('requestfailed',r=>network.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
try{
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
  await page.screenshot({path:'artifacts/login.png',fullPage:true});
  const account=accounts.find(a=>a.username==='rongrong-qa-child');
  await page.getByLabel('账号',{exact:true}).fill(account.username);
  await page.getByLabel('密码',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'进入冒险',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.login-submit')?.disabled,{},{timeout:65000});
  await page.locator('.starter-page, .adventure-page, .connection-banner, .loading-screen .error-text, .form-error').first().waitFor({timeout:90000});
  await page.waitForTimeout(1000);
  await page.screenshot({path:'artifacts/after-login.png',fullPage:true});
  console.log((await page.locator('body').innerText()).slice(0,3500));
  console.log('Browser errors:',JSON.stringify(errors));console.log('Network:',JSON.stringify(network));
  await writeFile('artifacts/browser-errors.json',JSON.stringify(errors,null,2));
}finally{await browser.close();}
