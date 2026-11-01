import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState} from './server/state';import {execute} from './server/engine';import {REGIONS} from './content/packs';
const now=new Date('2026-11-01T04:00:00Z');let state=execute(initialState([],now,'测试训练师',''),{type:'starter',payload:{speciesId:25}},'child',{now,uuid:()=>crypto.randomUUID(),random:()=>.3}).state;
state.badges=new URLSearchParams(location.search).get('badges')==='all'?REGIONS.map(r=>r.id):new URLSearchParams(location.search).get('badges')==='none'?[]:['home-meadow'];state.gymProgress.firstWins['home-meadow']='2026-10-31';state.position={regionId:'home-meadow',x:30,y:11};
window.__badges={calls:[],state};
export const auth={getSession:async()=>({data:{session:{user:{id:'fixture'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(c){window.__badges.calls.push(c.type);state=execute(state,c,'child',{now,uuid:()=>crypto.randomUUID(),random:()=>.3}).state;window.__badges.state=state;return {ok:true,state:publicState(state,'child',1,now)};}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=()=>[];
`},bundle:true,write:false,platform:'browser',format:'esm'});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'});const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/lib.ts',r=>r.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
await mkdir('artifacts',{recursive:true});
try{
 const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5176/';
 await page.goto(base+'#/collection?generation=gen1');await page.locator('.badge-card').first().waitFor();
 assert.equal(await page.getByRole('tab').count(),1);assert.equal(await page.locator('.badge-card').count(),8);assert.equal(await page.locator('.badge-card.earned').count(),1);assert.match(await page.locator('.badge-collection').innerText(),/2026-10-31 获得/);
 await page.reload();await page.locator('.badge-card').first().waitFor();assert.equal(await page.getByRole('tab').getAttribute('aria-selected'),'true');
 await page.goto(base+'#/collection?generation=unknown');assert.equal(await page.locator('.badge-card').count(),8);
 for(const width of [360,390,768,1365]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);assert.equal(await page.locator('.badge-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),width<=760?2:4);await page.screenshot({path:'artifacts/badges-'+width+'.png',fullPage:true});}
 assert(await page.locator('.badge-art img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),'all badge artwork loads');
 await page.route('**/assets/badges/**',r=>r.abort());await page.reload();await page.locator('.badge-art svg').first().waitFor();assert.match(await page.locator('.badge-card').first().innerText(),/岩石徽章/);await page.unroute('**/assets/badges/**');
 await page.getByRole('button',{name:'去冒险',exact:true}).click();await page.getByRole('button',{name:'进入道馆',exact:true}).waitFor();await page.getByRole('button',{name:'进入道馆',exact:true}).click();await page.getByRole('dialog',{name:'道馆挑战确认'}).waitFor();assert.match(await page.getByRole('dialog').innerText(),/退出也计次/);await page.getByRole('button',{name:'再准备一下',exact:true}).click();assert(!(await page.evaluate(()=>window.__badges.calls)).includes('gym.start'));
 await page.getByRole('button',{name:/冒险地图/}).click();assert.equal(await page.locator('.region-path button').nth(1).isDisabled(),true);assert.match(await page.locator('.region-path button').nth(1).innerText(),/2026-11-07 开放/);await page.getByRole('button',{name:'关闭地图'}).click();
 await page.getByRole('button',{name:'查看岩石徽章'}).click();await page.locator('.badge-card').first().waitFor();assert(page.url().endsWith('#/collection?generation=gen1'));assert.deepEqual(errors,[]);
 await page.goto(base+'?badges=none#/collection');await page.locator('.badge-card').first().waitFor();assert.equal(await page.locator('.badge-card.earned').count(),0);assert.match(await page.locator('.soft-tag').innerText(),/0 \/ 8/);
 await page.goto(base+'?badges=all#/collection');await page.locator('.badge-card').first().waitFor();assert.equal(await page.locator('.badge-card.earned').count(),8);assert.equal(await page.locator('.badge-card time').count(),1);await page.screenshot({path:'artifacts/badges-all.png',fullPage:true});
 await page.goto(base+'#/collection');await page.locator('.badge-card').first().waitFor();
 await page.route('**/src/game/badges.ts',async route=>{const response=await route.fetch();const body=await response.text();await route.fulfill({response,body:body+`\nBADGE_COLLECTIONS.push({id:'fixture-gen2',label:'第二世代 · 测试',badges:[{regionId:'fixture-region',name:'测试徽章',region:'测试区域',leader:'测试馆主',image:'assets/badges/gen1/earth.png'}]});`});});
 await page.reload();await page.getByRole('tab',{name:'第二世代 · 测试'}).waitFor();await page.getByRole('tab').first().focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.badge-card').count(),1);assert.match(await page.locator('.soft-tag').innerText(),/0 \/ 1/);assert(page.url().endsWith('generation=fixture-gen2'));await page.reload();await page.locator('.badge-card').first().waitFor();assert.equal(await page.locator('.badge-card').count(),1);await page.getByRole('tab',{name:'第二世代 · 测试'}).focus();await page.keyboard.press('Home');assert.equal(await page.locator('.badge-card').count(),8);assert.match(await page.locator('.soft-tag').innerText(),/1 \/ 8/);

 await writeFile('artifacts/badges-ui-report.json',JSON.stringify({checks:['collection route and refresh','unknown generation fallback','four viewports','images and failure fallback','gym confirmation cancellation','locked map date','badge rail link'],errors},null,2));console.log('PASS badge UI, responsive layouts, assets, routing and gym confirmation');
}finally{await browser.close();}
