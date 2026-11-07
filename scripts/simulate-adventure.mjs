import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export * from './server/state';export * from './server/engine';export * from './server/game-data';export {initializeBoxes} from './server/partner-storage';export {REGIONS} from './content/packs';`},bundle:true,write:false,platform:'node',format:'esm'});
const {initialState,makePartner,initializeBoxes,execute,grant,dayOf,dateShift,REGIONS,damage}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const rt={now:new Date('2026-11-08T04:00:00Z'),uuid:()=>crypto.randomUUID(),random:()=>.2};
function act(s,type,payload={},role='child',now=rt.now){return execute(s,{type,payload,operationId:crypto.randomUUID()},role,{...rt,now}).state;}
function gym(source,index,now){let s=structuredClone(source),r=REGIONS[index];s.battle=null;s.question=null;s.position={regionId:r.id,x:12,y:16};s.badges=REGIONS.slice(0,index).map(r=>r.id);s.gymProgress={initializedOn:'2026-01-01',firstWins:{},legacyOpenRegions:REGIONS.map(r=>r.id)};s.daily.gymStarts=0;s.settings.weekdayPassDate=dayOf(now);s=act(s,'gym.start',{},'child',now);let turns=0;
 while(s.battle.status==='active'&&turns<300){const p=s.partners.find(p=>p.id===s.battle.playerId),b=s.battle;const best=[...p.moves].sort((a,c)=>damage(p.speciesId,p.level,b.enemy,b.enemyLevel,c)-damage(p.speciesId,p.level,b.enemy,b.enemyLevel,a))[0];s=act(s,'battle.move',{moveId:best},'child',now);const q=s.question;const option=turns%5===4?q.options.find(o=>o.id!==q.correctOptionId).id:q.correctOptionId;s=act(s,'answer',{questionId:q.id,optionId:option},'child',now);if(s.question)s=act(s,'answer',{questionId:q.id,optionId:q.correctOptionId},'child',now);turns++;}
 return {region:r.id,result:s.battle.status,turns};}
const rows=[];
for(const count of [1,3,6])for(const scenario of ['partial','base','english','duplicate']){
 let s=initialState([],rt.now);s.started=true;s.partners=[1,4,7,25,16,19].slice(0,count).map(id=>makePartner(id,5,rt));s.team=s.partners.map(p=>p.id);initializeBoxes(s);s.settings.fastMultiplier=1;
 for(let d=0;d<56;d++){
  const now=new Date(dateShift('2026-11-08',d)+'T04:00:00Z');s=act(s,'bootstrap',{},'child',now);s.daily.correct=scenario==='english'||scenario==='duplicate'?10:0;
  const ids=s.settings.tasks.map(t=>t.id);s=act(s,'checkin.submit',{taskIds:ids},'child',now);s=act(s,'parent.review',{date:s.daily.date,approvedTaskIds:scenario==='partial'?ids.slice(0,2):ids,submissionVersion:1},'parent',now);
  if(scenario==='duplicate'&&[0,6].includes(now.getUTCDay()))for(let i=0;i<3;i++)grant(s,80,[s.team[i%count]]);
  if([7,14,28,56].includes(d+1))rows.push({count,scenario,days:d+1,levels:s.partners.map(p=>p.level),baseUsed:s.daily.baseExpUsed,carryBase:(s.sharedRewards??[]).reduce((n,r)=>n+r.base,0),gyms:REGIONS.map((_,i)=>gym(s,i,now))});
 }
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/adventure-balance.json',JSON.stringify({assumptions:'Fixed starter team, no evolution, no new higher-level captures, 80% first-answer accuracy, strongest equipped move, automatic relay. Base/English includes each 7-day streak reward; duplicate uses three weekend duplicate catches. Gym tests are independent snapshots, with access enabled for simulation only.',rows},null,2));
console.log(JSON.stringify(rows.filter(r=>[7,28,56].includes(r.days)).map(r=>({members:r.count,scenario:r.scenario,days:r.days,levels:r.levels,gymsWon:r.gyms.filter(g=>g.result==='won').length})),null,2));
