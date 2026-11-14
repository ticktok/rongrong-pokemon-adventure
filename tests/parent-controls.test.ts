import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {execute} from '../server/engine';
import {initialState,publicState,makePartner} from '../server/state';
import {gameCommand,type GameStore,type SaveRow} from '../server/game-service';
import {PgError} from '../server/pg';
import {hp,damage,defaultMoves} from '../server/game-data';
import {validateSave} from '../server/save-validation';
import type {ActionResult,GameState} from '../src/game/types';
const rt={now:new Date('2026-11-14T04:00:00Z'),uuid:randomUUID,random:()=>.3};
const cmd=(type:string,payload:Record<string,unknown>={})=>({type,payload,operationId:randomUUID()});
const act=(s:GameState,type:string,payload:Record<string,unknown>={},role:'child'|'parent'='child')=>execute(s,cmd(type,payload),role,rt);
const fresh=()=>act(initialState([],rt.now),'starter',{speciesId:25}).state;
class Store implements GameStore{
 row:SaveRow={state:fresh(),revision:1};source:SaveRow={state:fresh(),revision:3};operations=new Map<string,ActionResult>();writes=0;lockAtCommit=false;
 async one<T>(table:string,_columns:string,filters:Record<string,string>):Promise<T|null>{
  if(table==='rr_members')return {family_id:'qa',role:filters.uid==='parent'?'parent':'child'} as T;
  if(table==='rr_saves')return structuredClone(filters.family_id==='source'?this.source:this.row) as T;
  const result=this.operations.get(filters.operation_id);return (result?{result}:null) as T|null;
 }
 async rpc<T>(_name:string,p:Record<string,unknown>):Promise<T>{
  if(this.lockAtCommit){this.lockAtCommit=false;this.row.state.settings.childLocked=true;this.row.revision++;}
  if(p.p_revision!==this.row.revision)throw new PgError('REVISION_CONFLICT','40001');
  const prior=this.operations.get(String(p.p_operation));if(prior)return {...this.row,result:prior} as T;
  this.row={...this.row,state:structuredClone(p.p_state) as GameState,revision:this.row.revision+1};this.writes++;
  this.operations.set(String(p.p_operation),p.p_result as ActionResult);return structuredClone({...this.row,result:p.p_result}) as T;
 }
}
const run=(db:Store,type:string,payload:Record<string,unknown>={},role='child')=>gameCommand(cmd(type,payload),role,db,rt);
describe('parent control authorization and concurrency',()=>{
 it('reads without commits, operation records, or save mutation, including locked bootstrap',async()=>{
  const db=new Store();db.row.state.settings.childLocked=true;const before=structuredClone(db.row);
  for(const type of ['state.read','bootstrap'])expect((await run(db,type)).state?.settings.childLocked).toBe(true);
  expect(db.row).toEqual(before);expect(db.writes).toBe(0);expect(db.operations.size).toBe(0);
 });
 it('blocks all child writes and operation replays but permits parent unlock',async()=>{
  const db=new Store(),old=cmd('practice.start');expect((await gameCommand(old,'child',db,rt)).ok).toBe(true);
  await run(db,'parent.settings',{childLocked:true},'parent');const before=structuredClone(db.row);
  const q=db.row.state.question!;
  for(const type of ['answer','world.position','reward.claim','growth.ack','battle.leave','parent.settings','parent.gym.retry']){
   const r=await run(db,type,{questionId:q.id,optionId:q.correctOptionId,childLocked:false});expect(r.ok).toBe(false);expect(r.state?.settings.childLocked).toBe(true);
  }
  expect((await gameCommand(old,'child',db,rt)).ok).toBe(false);expect(db.row).toEqual(before);
  await run(db,'parent.settings',{childLocked:false},'parent');expect((await run(db,'answer',{questionId:q.id,optionId:q.correctOptionId})).ok).toBe(true);
 });
 it('rechecks a concurrent parent lock after commit conflict and preserves the unanswered question',async()=>{
  const db=new Store();await run(db,'practice.start');const q=structuredClone(db.row.state.question!);db.lockAtCommit=true;
  const result=await run(db,'answer',{questionId:q.id,optionId:q.correctOptionId});expect(result.ok).toBe(false);expect(result.state?.settings.childLocked).toBe(true);expect(db.row.state.question).toEqual(q);
 });
 it('validates settings and rejects child privilege escalation',async()=>{
  const db=new Store();expect((await run(db,'parent.settings',{childLocked:true})).ok).toBe(false);
  for(const payload of [{childLocked:'false'},{gymDifficulty:0},{gymDifficulty:3.1},{gymDifficulty:NaN},{gymDifficulty:Infinity},{gymDifficulty:1.55}])expect((await run(db,'parent.settings',payload,'parent')).ok).toBe(false);
  expect(db.writes).toBe(0);
 });
 it('follows lock and difficulty with unchanged local revision; retries remain local progress',async()=>{
  const db=new Store();db.row.content_source_family_id='source';db.source.state.settings.childLocked=true;db.source.state.settings.gymDifficulty=2;
  const a=await run(db,'state.read');expect(a.state?.settings.childLocked).toBe(true);expect(a.state?.settings.gymDifficulty).toBe(2);expect(db.writes).toBe(0);
  db.source.state.settings.childLocked=false;expect((await run(db,'state.read')).state?.settings.childLocked).toBe(false);
  expect((await run(db,'parent.settings',{childLocked:true},'parent')).ok).toBe(false);
  db.row.state.daily.gymStarts=1;expect((await run(db,'parent.gym.retry',{},'parent')).ok).toBe(true);expect(db.source.state.daily.gymExtraStarts).toBeUndefined();
 });
});
describe('gym difficulty and retry grants',()=>{
 it.each([.5,1,1.5,3])('scales every gym enemy and outgoing damage at %s',factor=>{
  let s=fresh();s.settings.gymDifficulty=factor;s=act(s,'gym.start').state;
  expect(s.battle!.enemyMaxHp).toBe(Math.floor(hp(s.battle!.enemy,s.battle!.enemyLevel)*factor));
  const p=s.partners[0],b=s.battle!,move=defaultMoves(b.enemy,b.enemyLevel).sort((a,c)=>damage(b.enemy,b.enemyLevel,p.speciesId,p.level,c)-damage(b.enemy,b.enemyLevel,p.speciesId,p.level,a))[0];
  s=act(s,'battle.move',{moveId:p.moves[0]}).state;const q=s.question!;
  const result=act(s,'answer',{questionId:q.id,optionId:q.correctOptionId});
  const attack=result.result.battlePlayback!.events.find(e=>e.kind==='attack'&&e.side==='enemy');
  expect(attack?.kind==='attack'&&attack.damage).toBe(Math.min(b.playerHp,Math.max(1,Math.floor(damage(b.enemy,b.enemyLevel,p.speciesId,p.level,move)*factor))));
  s=act(fresh(),'parent.settings',{gymDifficulty:factor},'parent').state;s=act(s,'gym.start').state;s.battle!.enemyHp=1;s.partners[0].moves=['normal-0'];
  s=act(s,'battle.move',{moveId:s.partners[0].moves[0]}).state;s=act(s,'answer',{questionId:s.question!.id,optionId:s.question!.correctOptionId}).state;
  expect(s.battle!.enemyIndex).toBe(1);expect(s.battle!.enemyMaxHp).toBe(Math.floor(hp(s.battle!.enemy,s.battle!.enemyLevel)*factor));validateSave(s);
 });
 it('preserves immunity, old active battles and wild battles',()=>{
  let s=fresh();delete s.settings.gymDifficulty;delete s.settings.childLocked;validateSave(s);expect(publicState(s,'child',1,rt.now).settings.gymDifficulty).toBe(1.5);
  s=act(s,'gym.start').state;expect(s.battle!.gymDifficulty).toBe(1.5);delete s.battle!.gymDifficulty;
  s=act(s,'parent.settings',{gymDifficulty:3},'parent').state;s.battle!.enemy=19;s.battle!.enemyLevel=1;s.battle!.enemyHp=1000;
  s.partners[0].speciesId=92;s=act(s,'battle.move',{moveId:s.partners[0].moves[0]}).state;
  const result=act(s,'answer',{questionId:s.question!.id,optionId:s.question!.correctOptionId});
  expect(result.state.battle!.playerHp).toBe(s.battle!.playerHp);
  s=fresh();s.settings.gymDifficulty=3;s=act(s,'encounter').state;expect(s.battle!.gymDifficulty).toBeUndefined();expect(s.battle!.enemyMaxHp).toBe(hp(s.battle!.enemy,s.battle!.enemyLevel));
 });
 it('snapshots a new battle and does not change it when parents adjust the next difficulty',()=>{
  let s=act(fresh(),'gym.start').state;const b=structuredClone(s.battle);s=act(s,'parent.settings',{gymDifficulty:.5},'parent').state;expect(s.battle).toEqual(b);
 });
 it('grants one outstanding retry, deduplicates replay and expires at Shanghai midnight',async()=>{
  const db=new Store();expect((await run(db,'parent.gym.retry',{},'parent')).ok).toBe(false);
  await run(db,'gym.start');expect((await run(db,'parent.gym.retry',{},'parent')).ok).toBe(false);await run(db,'battle.leave');
  const grant=cmd('parent.gym.retry');expect((await gameCommand(grant,'parent',db,rt)).state?.gymRemaining).toBe(1);
  expect((await run(db,'parent.gym.retry',{},'parent')).ok).toBe(false);await gameCommand(grant,'parent',db,rt);expect(db.row.state.daily.gymExtraStarts).toBe(1);
  await run(db,'gym.start');await run(db,'battle.leave');await gameCommand(grant,'parent',db,rt);expect(db.row.state.daily.gymExtraStarts).toBe(1);
  expect((await run(db,'parent.gym.retry',{},'parent')).state?.gymRemaining).toBe(1);
  const next=execute(db.row.state,cmd('bootstrap'),'child',{...rt,now:new Date('2026-11-14T16:00:00Z')});expect(next.state.daily.gymExtraStarts).toBeUndefined();expect(next.state.daily.gymStarts).toBe(0);
 });
 it('does not bypass weekday restrictions or consume a retry on a rejected start',()=>{
  let s=fresh();s.daily.date='2026-11-16';s.daily.gymStarts=1;s.daily.gymExtraStarts=1;
  expect(()=>execute(s,cmd('gym.start'),'child',{...rt,now:new Date('2026-11-16T04:00:00Z')})).toThrow('周末');expect(s.daily.gymStarts).toBe(1);
 });
 it('simulates the same six partners across difficulty factors',()=>{
  const outcomes=[];
  for(const factor of [.5,1,1.5,3]){
   let s=fresh();s.partners=[25,1,4,7,133,39].map(id=>makePartner(id,8,rt));s.team=s.partners.map(p=>p.id);s.settings.gymDifficulty=factor;s=act(s,'gym.start').state;let turns=0;
   while(s.battle!.status==='active'&&turns<200){const b=s.battle!,p=s.partners.find(p=>p.id===b.playerId)!;const move=[...p.moves].sort((a,c)=>damage(p.speciesId,p.level,b.enemy,b.enemyLevel,c)-damage(p.speciesId,p.level,b.enemy,b.enemyLevel,a))[0];s=act(s,'battle.move',{moveId:move}).state;s=act(s,'answer',{questionId:s.question!.id,optionId:s.question!.correctOptionId}).state;turns++;}
   expect(turns).toBeLessThan(200);outcomes.push({factor,turns,status:s.battle!.status});
  }
  console.log('Fixed six-partner gym simulation',outcomes);expect(outcomes[0].status).toBe('won');expect(outcomes[3].turns).toBeGreaterThan(outcomes[1].turns);
 });
});
