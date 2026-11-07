// Synthetic state only; real engine, no cloud calls or family data.
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {initialState,publicState,makePartner} from './server/state';import {execute} from './server/engine';import {initializeBoxes} from './server/partner-storage';import {MAPS,reachable} from './content/geometry';
const rt={now:new Date('2026-11-08T04:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>.3};
function fresh(){const s=initialState([],rt.now,'测试训练师');s.started=true;s.partners=Array.from({length:42},(_,i)=>makePartner(i+1,5+(i%20),rt));s.team=s.partners.slice(0,6).map(p=>p.id);s.partners[10].sealed=7;s.gymProgress.legacyOpenRegions=MAPS.map(m=>m.id);s.position={regionId:MAPS[0].id,x:12,y:16};initializeBoxes(s);return s;}
let s=JSON.parse(sessionStorage.getItem('adventure-state')||'null')??fresh(),revision=Number(sessionStorage.getItem('adventure-revision')||0);const results=new Map(),flags={loseResponse:false};
const persist=()=>{sessionStorage.setItem('adventure-state',JSON.stringify(s));sessionStorage.setItem('adventure-revision',revision);};
window.__adventure={get state(){return s;},flags,prepare(){s=fresh();persist();},region(index){const m=MAPS[index];s.position={regionId:m.id,x:m.discoveries[0].x,y:m.discoveries[0].y};persist();},combat(){s=fresh();s=execute(s,{type:'gym.start',payload:{}},'child',rt).state;persist();},move(){const m=MAPS[0],p=m.discoveries[0];s.position={regionId:m.id,x:p.x,y:p.y+1};persist();},conflict(){revision++;persist();}};
export const auth={getSession:async()=>({data:{session:{user:{id:'adventure-fixture'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}};
export async function request(command){if(results.has(command.operationId))return {...results.get(command.operationId),state:publicState(s,'child',revision,rt.now)};if((command.type==='team.update'||command.type.startsWith('box.'))&&command.payload.expectedRevision!==revision)return {ok:false,error:'伙伴位置已更新，请根据最新队伍重新选择',state:publicState(s,'child',revision,rt.now)};try{const next=execute(s,command,'child',rt);s=next.state;revision++;persist();const response={ok:true,state:publicState(s,'child',revision,rt.now),result:next.result};results.set(command.operationId,response);if(flags.loseResponse){flags.loseResponse=false;throw new TypeError('模拟保存后响应丢失');}return response;}catch(e){if(e instanceof TypeError)throw e;return {ok:false,error:e.message};}}
export const asset=(kind,id)=>'/assets/pokemon/'+kind+'/'+id+'.png';export const saveFile=()=>{};export const dueWords=s=>s.reviewCount;
`},bundle:true,write:false,platform:'browser',format:'esm'});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
await page.route('**/src/lib.ts',r=>r.fulfill({contentType:'application/javascript',body:fixture.outputFiles[0].text}));
await mkdir('artifacts',{recursive:true});
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:5176/';
const state=()=>page.evaluate(()=>window.__adventure.state);
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 await page.goto(base+'#/partners');await page.locator('.box-grid').waitFor();
 assert.equal(await page.locator('.party-slots .team-slot').count(),6);assert.equal(await page.locator('.box-grid .box-cell').count(),30);
 const original=(await state()).team,firstBox=(await state()).boxes[0],incoming=firstBox.slots[0];
 await page.locator('.box-grid .tile-add').first().click();await page.getByRole('dialog',{name:'让谁回盒子休息？'}).waitFor();await page.locator('.replacement-grid button').nth(2).click();
 await page.getByRole('dialog',{name:'让谁回盒子休息？'}).waitFor({state:'hidden'});assert.equal((await state()).team[2],incoming);assert.equal((await state()).boxes[0].slots[0],original[2]);
 pass('Full six-member team swaps atomically into the incoming box slot.');
 await page.locator('.party-slots .partner-tile').nth(2).click();await page.getByRole('button',{name:'设为首位',exact:true}).click();await page.waitForFunction(()=>window.__adventure.state.team[0]!==window.__adventure.state.partners[0].id);await page.keyboard.press('Escape');
 await page.locator('.party-slots .partner-tile').last().click();await page.getByRole('button',{name:'移回盒子',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await state()).team.length,5);
 await page.locator('.box-grid .tile-add').first().click();await page.waitForFunction(()=>window.__adventure.state.team.length===6);pass('Leading partner, return-to-box and direct add work.');
 await page.getByRole('button',{name:'新盒子',exact:true}).click();await page.getByRole('textbox',{name:'盒子名称'}).fill('水边伙伴');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('tab',{name:/水边伙伴/}).waitFor();
 await page.getByRole('tab',{name:/伙伴盒子 1/}).click();await page.getByRole('button',{name:'多选移动',exact:true}).click();await page.locator('.box-grid .partner-tile').nth(0).click();await page.locator('.box-grid .partner-tile').nth(1).click();await page.getByRole('button',{name:'移动到盒子',exact:true}).click();await page.getByRole('combobox',{name:'目标盒子'}).selectOption({label:'水边伙伴（30 个空位）'});await page.getByRole('button',{name:'移动 2 位伙伴',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await state()).boxes.at(-1).slots.filter(Boolean).length,2);await page.getByRole('button',{name:'退出多选',exact:true}).click();
 await page.getByRole('textbox',{name:'搜索伙伴'}).fill('pikachu');assert.equal(await page.locator('.box-grid .partner-tile').count(),1);await page.getByRole('textbox',{name:'搜索伙伴'}).fill('pikaqiu');assert.equal(await page.locator('.box-grid .partner-tile').count(),1);await page.getByRole('textbox',{name:'搜索伙伴'}).fill('025');assert.equal(await page.locator('.box-grid .partner-tile').count(),1);await page.getByRole('textbox',{name:'搜索伙伴'}).fill('');pass('Named boxes, bulk movement and multilingual/number search work.');
 await page.evaluate(()=>window.__adventure.conflict());await page.getByRole('button',{name:'新盒子',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.native-dialog [role=alert]').waitFor();assert.match(await page.locator('.native-dialog [role=alert]').innerText(),/位置已更新/);await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});pass('A stale revision refreshes state before a deliberate retry.');
 await page.evaluate(()=>window.__adventure.flags.loseResponse=true);await page.getByRole('button',{name:'新盒子',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.native-dialog').getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});await page.keyboard.press('Escape');assert.equal((await state()).boxes.length,5);pass('A lost response retries the same operation without creating a duplicate box.');
 await page.getByRole('tab',{name:/伙伴盒子 1/}).click();await page.locator('.toast button').click().catch(()=>{});
 for(const width of [360,768,1024,1365]){
  await page.setViewportSize({width,height:950});await page.screenshot({path:'artifacts/partners-'+width+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.party-slots .partner-tile').first().click();await page.screenshot({path:'artifacts/partner-detail-'+width+'.png'});await page.keyboard.press('Escape');assert(await page.locator('.party-slots .partner-tile').first().evaluate(e=>e===document.activeElement));
 }
 pass('Four viewport sizes have no horizontal overflow; native dialogs restore focus.');
 await page.evaluate(()=>window.__adventure.combat());await page.goto(base+'#/adventure');await page.reload();await page.locator('.switch-team').waitFor();assert.equal(await page.locator('.switch-team button').count(),6);await page.locator('.switch-team button').last().click();await page.waitForFunction(()=>window.__adventure.state.battle.playerId===window.__adventure.state.team[5]);await page.screenshot({path:'artifacts/battle-six-1365.png'});
 await page.setViewportSize({width:360,height:950});await page.screenshot({path:'artifacts/battle-six-360.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 pass('Battle renders six switch buttons and can switch to the sixth member.');
 await page.evaluate(()=>window.__adventure.prepare());await page.reload();
 await page.setViewportSize({width:1365,height:950});
 for(let i=0;i<8;i++){
  await page.evaluate(index=>window.__adventure.region(index),i);await page.goto(base+'#/adventure');await page.reload();await page.locator('.world-canvas canvas').waitFor();await page.getByRole('button',{name:'区域小地图',exact:true}).click();
  await page.locator('.interact.available').waitFor();await page.screenshot({path:'artifacts/map-'+i+'.png',fullPage:true});await page.locator('.interact.available').click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'继续探索',exact:true}).click();assert.equal((await state()).discoveries.length,i+1);
 }
 pass('All eight Phaser maps render with minimaps, and discoveries persist through real UI interactions.');
 await page.getByRole('button',{name:/冒险地图/}).click();await page.getByRole('dialog',{name:'关都冒险地图'}).waitFor();await page.screenshot({path:'artifacts/world-atlas.png'});await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__adventure.move());await page.reload();await page.locator('.world-canvas canvas').waitFor();await page.locator('.interact.available').waitFor();await page.keyboard.down('ArrowUp');await page.waitForTimeout(80);await page.keyboard.up('ArrowUp');await page.locator('.interact.available').click();await page.getByRole('dialog').waitFor();assert.equal((await state()).position.y,11);await page.getByRole('button',{name:'继续探索',exact:true}).click();
 pass('Keyboard movement flushes the final coordinate before discovery interaction.');
 await page.evaluate(()=>localStorage.setItem('rr-reduced','on'));await page.reload();await page.locator('.world-canvas canvas').waitFor();const down=await page.getByRole('button',{name:'向下',exact:true}).boundingBox();await page.mouse.move(down.x+down.width/2,down.y+down.height/2);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();await page.waitForFunction(()=>window.__adventure.state.position.y===12);assert.equal(await page.locator('html').getAttribute('data-reduced'),'true');pass('Pointer controls and reduced motion persist movement.');
 for(const width of [360,768,1024]){await page.setViewportSize({width,height:950});await page.screenshot({path:'artifacts/adventure-'+width+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);
}finally{await writeFile('artifacts/adventure-ui-report.json',JSON.stringify({checks,errors},null,2));await browser.close();}
