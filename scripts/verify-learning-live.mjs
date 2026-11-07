// Production UI with an isolated QA family; backups and restoration are mandatory.
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {loadOps,settings} from './ops-lib.mjs';
const {BackupStore,restoreFamily,execute}=await loadOps(),{envId,apiKey,version}=await settings(),store=new BackupStore(envId,apiKey);
const families=JSON.parse(await readFile('private/family-seed.json')),account=JSON.parse(await readFile('private/account-identities.json')).find(a=>a.username==='rongrong-qa-child');
assert.notEqual(families.qa,families.home);
const before=await store.snapshot(version,'manual'),beforeHome=before.saves.find(s=>s.family_id===families.home),original=before.saves.find(s=>s.family_id===families.qa);
const backupFile='private/backups/learning-qa-'+randomUUID()+'.json.gz';await writeFile(backupFile,gzipSync(JSON.stringify(before)),{mode:0o600,flag:'wx'});await store.uploadVerified(before);
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1024,height:768}});page.setDefaultTimeout(60000);const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_URL??JSON.parse(await readFile('deployment.json')).url;
const vocabularyRun=process.env.VOCABULARY_QA==='1';
const vocabularyWords=['red','apple','ice cream','back cover','front cover','scissors','kitten','indigo','toothbrush','plum'];
async function current(){return store.currentFamily(families.qa);}
async function answer(correct=true){await page.locator('.quiz-options button').first().waitFor();await page.waitForFunction(()=>!document.querySelector('.quiz-options button')?.disabled);const q=(await current()).state.question;assert(q);await page.locator('.quiz-options button').nth(q.options.findIndex(o=>(o.id===q.correctOptionId)===correct)).click();}
try{
 const state=structuredClone(original.state),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 state.daily={date,questions:0,correct:0,completedIds:[],encounters:0,expGranted:0,practiceFinished:false};state.question=null;state.battle=null;state.mastery={};
 if(vocabularyRun){
  const builtIn=JSON.parse(await readFile('content/words.json'));state.customWords=[];state.settings.maxWordLevel=2;
  state.disabledWordIds=builtIn.filter(w=>!vocabularyWords.includes(w.word)).map(w=>w.id);
  assert.equal(builtIn.filter(w=>vocabularyWords.includes(w.word)).length,10);
 }
 const fresh=state.started?state:execute(state,{type:'starter',payload:{speciesId:25},operationId:randomUUID()},'child',{now:new Date(),uuid:randomUUID,random:()=>0.3}).state;
 await store.rpc('rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:original.revision,p_state:fresh,p_result:{message:'Prepare isolated learning QA'}});
 await page.goto(base+'#/learning');const notice=page.getByRole('button',{name:/^确定访问/});if(await notice.count())await notice.click();await page.getByLabel('账号',{exact:true}).waitFor();
 await page.getByLabel('账号',{exact:true}).fill(account.username);await page.getByLabel('密码',{exact:true}).fill(account.password);await page.getByRole('button',{name:'进入冒险',exact:true}).click();await page.getByRole('button',{name:'学习手册',exact:true}).click();
 await page.getByRole('button',{name:'开始今天的练习',exact:true}).click();await answer(false);await page.locator('.word-explanation').waitFor();await page.reload();await page.locator('.word-explanation').waitFor();await answer();await page.getByRole('button',{name:'下一题',exact:true}).waitFor();
 assert.equal((await current()).state.daily.correct,0);checks.push('Wrong correction survives refresh; feedback stays in dialog.');
 await page.context().setOffline(true);await page.getByRole('button',{name:'下一题',exact:true}).click();await page.getByRole('button',{name:'重试这一步',exact:true}).waitFor();assert.equal((await current()).state.daily.questions,1);await page.context().setOffline(false);await page.getByRole('button',{name:'重试这一步',exact:true}).click();await answer();await page.getByRole('button',{name:'下一题',exact:true}).waitFor();checks.push('Next-question network retry stays in dialog and does not duplicate progress.');
 await page.getByRole('button',{name:'稍后继续',exact:true}).click();await page.getByRole('button',{name:'继续练习',exact:true}).click();await answer();await page.getByRole('button',{name:'下一题',exact:true}).waitFor();
 for(let i=3;i<10;i++){await page.getByRole('button',{name:'下一题',exact:true}).click();await answer();await page.locator('.quiz-complete-actions').waitFor();}
 await page.getByRole('button',{name:'完成挑战',exact:true}).waitFor();const completed=await current();assert.equal(completed.state.daily.questions,10);assert.equal(completed.state.daily.correct,9);await page.screenshot({path:'artifacts/learning-live-tablet.png',fullPage:true});await page.getByRole('button',{name:'完成挑战',exact:true}).click();checks.push('Ten questions complete once; first-answer score 9/10; pause/resume works.');
 const recordings=JSON.parse(await readFile('content/pronunciations.json'));const words=await page.locator('.word-chips button').all();let played=false;
 for(const button of words){const label=await button.getAttribute('aria-label'),word=label.slice('听单词 '.length);if(!recordings[word.toLowerCase()])continue;await button.click();await button.getByText('正在播放',{exact:true}).waitFor();played=true;break;}
 assert(played);checks.push('Chrome plays a same-origin standard recording from a real user click.');
 if(vocabularyRun){
  const learned=await page.locator('.word-chips .english').allTextContents();assert.deepEqual(learned.map(w=>w.trim()).sort(),[...vocabularyWords].sort());
  const phrase=page.getByRole('button',{name:'听单词 back cover',exact:true});await phrase.click();await phrase.getByText('正在播放',{exact:true}).waitFor();
  checks.push('All ten selected old/new words and phrases reached real questions; synthetic phrase audio played.');
 }
 assert.deepEqual(errors,[]);checks.forEach(x=>console.log('PASS',x));
}finally{
 await browser.close();const row=await current();await restoreFamily(store,before,families.qa,row.revision,version);assert.deepEqual((await current()).state,original.state);
 const home=await store.currentFamily(families.home);if(home.revision===beforeHome.revision)assert.deepEqual(home.state,beforeHome.state);else throw new Error('Production changed concurrently; inspect normal progress before signing off.');
 await writeFile('artifacts/learning-live-report.json',JSON.stringify({version,checks,errors,qaRestored:true,productionUnchanged:true},null,2));console.log('QA restored, production save unchanged.');
}
