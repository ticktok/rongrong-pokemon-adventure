// Deployed UI verification on the isolated QA family; snapshot and restore required.
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadOps,settings} from './ops-lib.mjs';
const {BackupStore,restoreFamily,execute,validateSave}=await loadOps();
const {envId,apiKey,version}=await settings(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json','utf8'));
const account=JSON.parse(await readFile('private/account-identities.json','utf8')).find(a=>a.username==='rongrong-qa-child');
assert(account);assert.notEqual(families.qa,families.home);
const snapshot=await store.snapshot(version,'manual'),original=snapshot.saves.find(s=>s.family_id===families.qa),homeBefore=snapshot.saves.find(s=>s.family_id===families.home);
assert(original&&homeBefore);
await writeFile('private/backups/pokedex-qa-'+randomUUID()+'.json.gz',gzipSync(JSON.stringify(snapshot)),{mode:0o600,flag:'wx'});
await store.uploadVerified(snapshot);
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1365,height:950}});
page.setDefaultTimeout(60000);
const report={version,checks:[],errors:[],laterGenerationImageRequests:0,qaRestored:false,productionProgressPreserved:false};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('request',r=>{const m=r.url().match(/\/pokemon\/(art|front|back)\/(\d+)\.png/);if(m&&Number(m[2])>151)report.laterGenerationImageRequests++;});
const base=JSON.parse(await readFile('deployment.json','utf8')).url;
const pass=message=>{report.checks.push(message);console.log('PASS',message);};
try{
 if(!original.state.started){
  const started=execute(original.state,{type:'starter',payload:{speciesId:25},operationId:randomUUID()},'child',{now:new Date(),uuid:randomUUID,random:()=>0.3}).state;
  await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:original.revision,p_state:started,p_result:{message:'Prepare isolated Pokédex QA'}});
 }
 await page.goto(base,{waitUntil:'networkidle'});
 const notice=page.getByRole('button',{name:/^确定访问/});if(await notice.count())await notice.click();
 await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();
 await page.locator('.app-shell').waitFor();await page.getByRole('button',{name:'发现图鉴',exact:true}).click();await page.locator('#dex-card-25').waitFor();
 assert.match(await page.locator('.app-footer').innerText(),new RegExp('v'+version.replaceAll('.','\\.')));
 const afterLogin=await store.currentFamily(families.qa);
 assert.equal(await page.locator('.dex-card').count(),151);pass('Deployed v'+version+' opens the current generation with 151 entries.');
 const input=page.getByRole('combobox',{name:'搜索宝可梦'});
 await input.fill('xym');await page.locator('#dex-option-906').click();assert.equal(await page.locator('#dex-detail-title').innerText(),'新叶喵');assert.equal(await page.locator('dialog .dex-artwork img,dialog .stat-grid').count(),0);await page.getByRole('button',{name:'关闭详情'}).click();
 assert.equal(await page.locator('.dex-card').count(),120);await page.locator('.dex-type-options button').filter({hasText:/^火$/}).click();assert.equal(await page.locator('#dex-card-906').count(),0);assert.equal(await page.locator('#dex-card-909').count(),1);pass('Global pinyin initials jump to generation nine; locked details and fire filtering work.');
 await input.fill('#025');await input.press('Enter');assert.equal(await page.locator('#dex-detail-title').innerText(),'皮卡丘');assert.equal(await page.locator('dialog .stat-grid>div').count(),4);await page.keyboard.press('Escape');
 await input.fill('pikachu');await page.locator('#dex-option-25').click();await page.getByRole('button',{name:'关闭详情'}).click();pass('National numbers and English search preserve the original full details.');
 await page.getByRole('group',{name:'按首次登场世代筛选'}).getByRole('button',{name:/^全国图鉴/}).click();assert.equal(await page.locator('.dex-card').count(),60);await page.getByRole('button',{name:'加载更多'}).click();assert.equal(await page.locator('.dex-card').count(),120);
 await page.setViewportSize({width:390,height:844});await page.getByRole('group',{name:'按首次登场世代筛选'}).getByRole('button',{name:/^第九世代/}).click();await page.locator('.dex-type-toggle').click();await page.locator('.dex-type-options button').filter({hasText:/^水$/}).click();assert(await page.locator('.dex-card').count()>0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('.dex-type-toggle').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'artifacts/pokedex-live-mobile.png'});pass('Production batching and mobile attribute selection work without horizontal overflow.');
 const afterBrowse=await store.currentFamily(families.qa);assert.equal(afterBrowse.revision,afterLogin.revision);assert.deepEqual(afterBrowse.state,afterLogin.state);assert.equal(report.laterGenerationImageRequests,0);assert.deepEqual(report.errors,[]);pass('Browsing and searching leave QA revision/state unchanged; later-generation artwork requests are zero.');
}finally{
 await browser.close();const current=await store.currentFamily(families.qa);
 await restoreFamily(store,snapshot,families.qa,current.revision,version);assert.deepEqual((await store.currentFamily(families.qa)).state,original.state);report.qaRestored=true;
 const homeAfter=await store.currentFamily(families.home);validateSave(homeAfter.state);
 assert.equal(homeAfter.revision,homeBefore.revision,'Formal family changed concurrently; review progress before release.');assert.deepEqual(homeAfter.state,homeBefore.state);report.productionProgressPreserved=true;
 await writeFile('artifacts/pokedex-live-report.json',JSON.stringify(report,null,2));console.log('QA restored; formal family unchanged.');
}
