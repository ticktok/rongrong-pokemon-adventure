import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
await build({entryPoints:['server/game-data.ts'],outfile:'private/game-data.mjs',bundle:true,platform:'node',format:'esm'});
const {damage,defaultMoves,expFor}=await import('../private/game-data.mjs');
const regions=JSON.parse(await readFile('content/gen1/regions.json'));
const {apiKey}=JSON.parse(await readFile('private/server.json'));
const families=JSON.parse(await readFile('private/family-seed.json'));
assert.notEqual(families.qa,families.home);
const root='https://wind-d7gesdlb779f8214f.api.tcloudbasegateway.com/v1/rdb/rest/';
async function pg(path,body){const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}
async function saved(){return (await pg('rr_saves?select=state,revision&family_id=eq.'+families.qa))[0];}
async function fixture(edit){const row=await saved();edit(row.state);return pg('rpc/rr_commit',{p_family:families.qa,p_operation:randomUUID(),p_revision:row.revision,p_state:row.state,p_result:{message:'QA fixture'}});}
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const checks=[],browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({storageState:'private/qa-browser-state.json',viewport:{width:1280,height:850}});
const page=await context.newPage();page.setDefaultTimeout(90000);
async function call(type,payload={}){const result=await page.evaluate(async command=>{const m=await import('/src/lib.ts');return m.request(command);},{type,payload,operationId:randomUUID()});assert.equal(result.ok,true,result.error);return result.state;}
function pass(name){checks.push(name);console.log('PASS',name);}
try{
 await page.goto('http://127.0.0.1:5173/#/learning');await page.locator('.learning-grid').waitFor();
 await fixture(s=>{
   s.battle=null;s.question=null;s.settings.weekdayPassDate=day();s.settings.captureLimit=30;
   const ids=[3,9,25];s.partners=ids.map(speciesId=>({id:randomUUID(),speciesId,exp:expFor(50),level:50,moves:defaultMoves(speciesId,50),acquiredAt:day()}));s.team=s.partners.map(p=>p.id);s.badges=[];s.caught=[...new Set([...s.caught,...ids])];
 });
 for(const region of regions){
   if((await saved()).state.settings.weekdayPassDate!==day())await fixture(s=>s.settings.weekdayPassDate=day());
   await call('world.position',{regionId:region.id,x:19,y:18});
   let s=await call('gym.start'),turns=0;
   while(s.battle.status==='active'){
     assert(turns++<30,'Gym battle stalled');
     const p=s.partners.find(p=>p.id===s.battle.playerId),b=s.battle;
     const move=[...p.moves].sort((a,c)=>damage(p.speciesId,p.level,b.enemy,b.enemyLevel,c)-damage(p.speciesId,p.level,b.enemy,b.enemyLevel,a))[0];
     await call('battle.move',{moveId:move});
     const q=(await saved()).state.question;s=await call('answer',{questionId:q.id,optionId:q.correctOptionId});
   }
   assert.equal(s.battle.status,'won');assert(s.badges.includes(region.id));assert(s.partners.some(p=>p.speciesId===region.gift&&p.sealed===s.settings.sealDays));
   await call('battle.leave');pass('Gym victory, badge and sealed gift: '+region.name);
 }
 let s=await call('world.position',{regionId:'home-meadow',x:12,y:16});
 for(const [npcId,speciesId] of [['family-mum',134],['family-grandpa',135],['family-nana',136]]){
   await call('npc.challenge',{npcId});const q=(await saved()).state.question;s=await call('answer',{questionId:q.id,optionId:q.correctOptionId});assert(s.partners.some(p=>p.speciesId===speciesId));
 }
 pass('All three Eevee branches can be collected through family challenges');
 const evolvingId=randomUUID();
 await fixture(s=>{s.partners.push({id:evolvingId,speciesId:10,exp:expFor(10),level:10,moves:defaultMoves(10,10),acquiredAt:day()});});
 s=await call('evolve',{partnerId:evolvingId,speciesId:11});s=await call('evolve',{partnerId:evolvingId,speciesId:12});assert.equal(s.partners.find(p=>p.id===evolvingId).speciesId,12);pass('Two-stage evolution persists to cloud');
 let caught=false;
 for(let attempt=0;attempt<10&&!caught;attempt++){
   if((await saved()).state.settings.weekdayPassDate!==day())await fixture(s=>s.settings.weekdayPassDate=day());
   s=await call('encounter');
   for(let ball=0;ball<3&&s.battle.status==='active';ball++){
     await call('battle.catch');const q=(await saved()).state.question;s=await call('answer',{questionId:q.id,optionId:q.correctOptionId});
   }
   caught=s.battle.status==='caught';await call('battle.leave');
 }
 assert(caught,'No successful capture in the bounded QA sample');pass('Successful capture and collection reward in the live backend');
 await page.reload();await page.locator('.learning-grid').waitFor();
 await page.getByRole('button',{name:'去冒险',exact:true}).click();await page.locator('.world-canvas canvas').waitFor();
 await page.getByRole('button',{name:/冒险地图/}).click();await page.locator('.world-map-dialog').waitFor();
 assert.equal(await page.locator('.region-path .unlocked').count(),8);await page.screenshot({path:'artifacts/all-regions.png',fullPage:true});pass('All eight unlocked regions render in the map');
 const home=(await pg('rr_saves?select=state&family_id=eq.'+families.home))[0].state;assert.equal(home.started,false);assert.equal(home.partners.length,0);pass('Real family progress remains untouched');
}catch(error){console.error(error);process.exitCode=1;checks.push('FAILED: '+String(error));}
finally{await writeFile('artifacts/adventure-checks.json',JSON.stringify(checks,null,2));await browser.close();}
