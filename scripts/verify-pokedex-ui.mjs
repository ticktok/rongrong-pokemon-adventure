// Synthetic browser session only: no real accounts, cloud calls or save writes.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState} from './server/state';import {execute} from './server/engine';
const now=new Date('2026-10-21T04:00:00Z');
const state=execute(initialState([],now,'测试训练师',''),{type:'starter',payload:{speciesId:25}},'child',{now,uuid:()=>crypto.randomUUID(),random:()=>0.3}).state;
state.caught=[1,6,9,25];state.seen=[1,4,6,9,25];
const calls=[];window.__dex={state,calls};
export const auth={getSession:async()=>({data:{session:{user:{id:'pokedex-fixture'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(command){calls.push(command.type);if(command.type!=='bootstrap')throw new Error('The Pokédex must not send game commands');return {ok:true,state:publicState(state,'child',7,now)};}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=()=>[];
`},bundle:true,write:false,platform:'browser',format:'esm'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1365,height:950},serviceWorkers:'block'}),page=await context.newPage(),errors=[],speciesRequests=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{const match=request.url().match(/\/pokemon\/(art|front|back)\/(\d+)\.png/);if(match)speciesRequests.push(Number(match[2]));});
await page.route('**/src/lib.ts',route=>route.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
await mkdir('artifacts',{recursive:true});
const input=()=>page.getByRole('combobox',{name:'搜索宝可梦'});
const generation=name=>page.getByRole('group',{name:'按首次登场世代筛选'}).getByRole('button',{name:new RegExp('^'+name)});
const status=name=>page.getByRole('group',{name:'收录状态'}).getByRole('button',{name,exact:true});
const type=name=>page.locator('.dex-type-options button').filter({hasText:new RegExp('^'+name+'$')});
async function search(query){await input().fill(query);await page.waitForFunction(()=>document.querySelector('[role=combobox]')?.getAttribute('aria-expanded')==='true');}
async function close(){await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});}
function pass(message){checks.push(message);console.log('PASS',message);}
try{
 await page.goto((process.env.TEST_BASE_URL??'http://127.0.0.1:5176/')+'#/pokedex');await page.locator('#dex-card-25').waitFor();
 const before=await page.evaluate(()=>JSON.stringify(window.__dex.state));
 assert.equal(await page.locator('.dex-card').count(),151);assert.equal(await page.locator('.dex-progress strong').innerText(),'4');
 assert.equal(await page.locator('#dex-card-25').getAttribute('class'),'dex-card caught');assert.equal(await page.locator('#dex-card-4').getAttribute('class'),'dex-card seen');assert.equal(await page.locator('#dex-card-2').getAttribute('class'),'dex-card undiscovered');
 await page.locator('#dex-card-25').click();assert.equal(await page.locator('.stat-grid>div').count(),4);await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement.id),'dex-card-25');pass('Current generation, 151 entries, collection count and all three statuses preserved.');
 for(const [label,count] of [['第二世代',100],['第三世代',135],['第四世代',107],['第五世代',156],['第六世代',72],['第七世代',88],['第八世代',96],['第九世代',120]]){
  await generation(label).click();assert.equal(await page.locator('.dex-card').count(),count);assert.equal(await page.locator('.dex-artwork img').count(),0);
 }
 await page.locator('#dex-card-1025').click();assert.equal(await page.locator('#dex-detail-title').innerText(),'桃歹郎');assert.equal(await page.locator('dialog .stat-grid,dialog .english,dialog img:not(.type-icon)').count(),0);assert.match(await page.locator('dialog').innerText(),/未解锁/);await close();pass('All nine generation counts and locked details; no later-generation artwork.');
 await generation('全国图鉴').click();assert.equal(await page.locator('.dex-card').count(),60);await page.getByRole('button',{name:'加载更多',exact:true}).click();assert.equal(await page.locator('.dex-card').count(),120);await type('火').click();assert.equal(await page.locator('.dex-card').count(),60);await type('火').click();pass('National view loads in batches of 60 and resets after filtering.');
 await generation('第一世代').click();await type('火').click();await status('已收录').click();assert.equal(await page.locator('.dex-card').count(),1);assert.equal(await page.locator('.dex-card').getAttribute('id'),'dex-card-6');
 await search('xinyemiao');assert.equal(await page.locator('.dex-card').count(),0);assert.match(await page.locator('.empty-state').innerText(),/第一世代/);await input().press('ArrowDown');await input().press('Enter');assert.equal(await page.locator('#dex-detail-title').innerText(),'新叶喵');assert.equal(await generation('第九世代').getAttribute('aria-pressed'),'true');assert.equal(await status('全部').getAttribute('aria-pressed'),'true');assert.equal(await type('全部属性').getAttribute('aria-pressed'),'true');assert.equal(await input().inputValue(),'');await close();assert.equal(await page.evaluate(()=>document.activeElement.id),'dex-card-906');pass('Global suggestions cross generations, clear conflicting filters, open details and restore card focus.');
 for(const query of ['皮卡','PIKA','pikaqiu','pkq','25','025','#025']){await search(query);assert(await page.locator('#dex-option-25').count());await page.locator('#dex-option-25').click();assert.equal(await page.locator('#dex-detail-title').innerText(),'皮卡丘');await close();}
 await search('a');assert.equal(await page.getByRole('option').count(),8);await input().press('Escape');assert.equal(await input().getAttribute('aria-expanded'),'false');await input().focus();await input().press('ArrowUp');assert.equal(await input().getAttribute('aria-activedescendant'),await page.getByRole('option').last().getAttribute('id'));await page.waitForFunction(()=>{const option=document.querySelector('[role=option][aria-selected=true]'),box=option?.parentElement;return option&&box&&option.getBoundingClientRect().bottom<=box.getBoundingClientRect().bottom+1;});await page.getByRole('button',{name:'清空搜索'}).click();
 await input().dispatchEvent('compositionstart');await input().fill('皮卡');assert.equal(await input().getAttribute('aria-expanded'),'false');await input().dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(await page.locator('dialog').count(),0);await input().dispatchEvent('compositionend',{data:'皮卡'});await page.locator('#dex-option-25').waitFor();await input().press('Enter');await close();pass('Chinese, English, pinyin, initials, number formats, keyboard navigation and IME composition work.');
 await search('no-such-pokemon');assert.match(await page.locator('.dex-no-suggestions').innerText(),/没有找到/);await page.getByRole('button',{name:'清除筛选',exact:true}).click();assert.equal(await page.locator('.dex-card').count(),151);assert.equal(await input().inputValue(),'');pass('Empty state explains scope; clearing filters restores the current generation.');
 for(const width of [360,390,768,1024,1365]){
  await page.setViewportSize({width,height:width<500?844:950});await generation('第九世代').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow at '+width);
  if(width<500){assert.equal(await page.locator('.dex-type-toggle').getAttribute('aria-expanded'),'false');assert.equal(await type('火').isVisible(),false);await page.locator('.dex-type-toggle').click();await type('水').click();assert(await page.locator('.dex-card').count()>0);await type('全部属性').click();await page.locator('.dex-type-toggle').click();const cols=await page.locator('.dex-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(cols,2);}
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'artifacts/pokedex-'+width+'.png'});
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.dex-card').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.context().setOffline(true);await search('pecharunt');await page.locator('#dex-option-1025').click();await close();await page.context().setOffline(false);pass('Five viewport widths, mobile attribute panel, reduced motion and local offline search verified.');
 await page.getByRole('button',{name:'我的伙伴',exact:true}).click();await page.locator('.partner-card').waitFor();await page.getByRole('button',{name:'发现图鉴',exact:true}).click();await page.locator('#dex-card-25').waitFor();assert.equal(await generation('第一世代').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__dex.state)),before);assert.deepEqual(await page.evaluate(()=>window.__dex.calls),['bootstrap']);assert(speciesRequests.every(id=>id<=151));assert.deepEqual(errors,[]);pass('Adjacent partner page works; returning defaults to current generation; no game commands or save changes.');
 await writeFile('artifacts/pokedex-ui-report.json',JSON.stringify({checks,errors,laterGenerationImageRequests:speciesRequests.filter(id=>id>151).length},null,2));
}finally{await browser.close();}
