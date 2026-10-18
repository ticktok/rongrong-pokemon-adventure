import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=JSON.parse(await readFile('deployment.json')).url;
const account=JSON.parse(await readFile('private/account-identities.json')).find(a=>a.username==='rongrong-qa-parent');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();page.setDefaultTimeout(90000);
const checks=[];function pass(s){checks.push(s);console.log('PASS',s);}
try{
 await page.goto(base+'#/parent',{waitUntil:'networkidle'});
 const confirmation=page.getByRole('button',{name:/^确定访问/});if(await confirmation.count())await confirmation.click();
 await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();
 await page.getByRole('button',{name:'家长',exact:true}).waitFor();await page.getByRole('button',{name:'家长',exact:true}).click();
 if(!process.env.SKIP_CSV){
 await page.getByRole('button',{name:'英语词库',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('word,meaning,topic,level,example\ncat,猫,测试,8,A cat.\n')});
 await page.getByRole('heading',{name:'词表导入预览',exact:true}).waitFor();
 assert(await page.getByRole('button',{name:/确认导入/}).isDisabled());pass('Invalid CSV shows row errors and blocks import');
 await page.getByRole('button',{name:'关闭导入预览',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'words.csv',mimeType:'text/csv',buffer:Buffer.from('word,meaning,topic,level,example\napple,苹果,美味食物,1,Look at the apple.\nbridge,桥,测试词库,2,We cross the bridge.\n')});
 await page.getByRole('button',{name:'确认导入 2 个词',exact:true}).click();await page.getByRole('heading',{name:'词表导入预览',exact:true}).waitFor({state:'hidden'});
 await page.getByPlaceholder('搜索单词或词义').fill('bridge');assert.equal(await page.locator('tbody tr').count(),1);pass('CSV preview imports new words and updates matching entries');
 await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('中文词义',{exact:true}).fill('桥梁');await page.getByRole('button',{name:'保存单词',exact:true}).click();await page.getByRole('heading',{name:'编辑单词',exact:true}).waitFor({state:'hidden'});assert((await page.locator('tbody').innerText()).includes('桥梁'));pass('Vocabulary editing persists through the parent form');
 }
 await page.getByRole('button',{name:'家人与同学',exact:true}).click();const old=await page.locator('textarea').inputValue();
 await page.locator('textarea').fill('我们一起认识一个新单词。');await page.getByRole('button',{name:'保存这位朋友',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.admin-panel>.primary')?.disabled);
 await page.reload({waitUntil:'networkidle'});await page.locator('.parent-page').waitFor();await page.getByRole('button',{name:'家人与同学',exact:true}).click();assert.equal(await page.locator('textarea').inputValue(),'我们一起认识一个新单词。');
 await page.locator('textarea').fill(old);await page.getByRole('button',{name:'保存这位朋友',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.admin-panel>.primary')?.disabled);pass('NPC dialogue edit survives reload and can be restored');
 await page.getByRole('button',{name:'家庭规则',exact:true}).click();const toggle=page.getByLabel('今天临时开放对战与捕捉',{exact:false});
 const original=await toggle.isChecked();await context.setOffline(true);await toggle.click();await page.locator('.connection-banner').waitFor();
 const pending=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)), 'rr-pending-'+account.uid);assert.equal(pending.type,'parent.settings');assert.equal(pending.payload.weekdayPassDate,!original);
 await page.getByRole('button',{name:'保存家庭规则',exact:true}).click();
 const retained=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)), 'rr-pending-'+account.uid);assert.equal(retained.operationId,pending.operationId);pass('Offline operation is retained and cannot be overwritten by another action');
 await context.setOffline(false);await page.getByRole('button',{name:'重试',exact:true}).click();await page.locator('.connection-banner').waitFor({state:'hidden'});
 assert.equal(await toggle.isChecked(),!original);assert.equal(await page.evaluate(key=>localStorage.getItem(key),'rr-pending-'+account.uid),null);pass('Reconnection retries the original operation successfully');
 await page.getByRole('button',{name:'存档与记录',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出家庭存档',exact:true}).click();await (await download).saveAs('private/qa-admin-export.json');
 const exported=JSON.parse(await readFile('private/qa-admin-export.json'));assert.equal(exported.badges.length,8);assert.equal(exported.nickname,'测试训练师');pass('Parent exports the full eight-gym QA save');
}catch(e){await page.screenshot({path:'artifacts/admin-failure.png',fullPage:true});console.log((await page.locator('body').innerText()).slice(-3500));checks.push('FAILED: '+e);console.error(e);process.exitCode=1;}
finally{await writeFile('artifacts/admin-checks.json',JSON.stringify(checks,null,2));await browser.close();}
