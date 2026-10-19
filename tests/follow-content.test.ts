import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {initialState} from '../server/state';
import {execute} from '../server/engine';
import {followContent} from '../server/follow-content';
import {gameCommand,gameCaller,type SaveRow,type GameStore} from '../server/game-service';
import {PgError} from '../server/pg';
import type {GameCommand,GameState,ActionResult} from '../src/game/types';
import {validateBackup,decodeBackup,restoreFamily,BackupStore,type Backup} from '../server/backup';
import {gzipSync} from 'node:zlib';
const rt={now:new Date('2026-10-19T04:00:00Z'),uuid:randomUUID,random:()=>0.1};
const home=randomUUID(),trial=randomUUID(),other=randomUUID();
const command=(type:string,payload:Record<string,unknown>={}):GameCommand=>({type,payload,operationId:randomUUID()});
const fresh=()=>initialState([{id:'test-npc',name:'朋友',regionId:'home-meadow',x:10,y:10,kind:'family',line:'你好',quest:'学习'}],rt.now,'测试训练师','测试账号');
class Store implements GameStore {
 saves=new Map<string,SaveRow>([[home,{state:fresh(),revision:30}],[trial,{state:fresh(),revision:0,content_source_family_id:home}]]);
 operations=new Map<string,ActionResult>(); writes:string[]=[]; conflict=false; sourceFailure=false;
 async one<T>(table:string,_columns:string,filters:Record<string,string>):Promise<T|null>{
  if(table==='rr_members')return ({'child':{family_id:trial,role:'child'},'parent':{family_id:trial,role:'parent'},'home-parent':{family_id:home,role:'parent'}}[filters.uid]??null) as T|null;
  if(table==='rr_saves'){
   if(filters.family_id===home&&this.sourceFailure)throw new Error('read failed');
   return structuredClone(this.saves.get(filters.family_id)??null) as T|null;
  }
  const result=this.operations.get(filters.family_id+':'+filters.operation_id);
  return (result?{result}:null) as T|null;
 }
 async rpc<T>(_name:string,args:Record<string,unknown>):Promise<T>{
  const id=String(args.p_family),row=this.saves.get(id)!;
  if(this.conflict){this.conflict=false;row.revision++;row.state.daily.correct=2;throw new PgError('REVISION_CONFLICT','40001');}
  if(row.revision!==args.p_revision)throw new PgError('REVISION_CONFLICT','40001');
  const key=id+':'+args.p_operation,old=this.operations.get(key);
  if(old)return {...row,result:old} as T;
  row.state=structuredClone(args.p_state) as GameState;row.revision++;
  this.writes.push(id);this.operations.set(key,args.p_result as ActionResult);
  return structuredClone({...row,result:args.p_result}) as T;
 }
}
const run=(db:Store,type:string,payload:Record<string,unknown>={},uid='child')=>gameCommand(command(type,payload),uid,db,rt);

describe('following content without sharing progress',()=>{
 it('copies only content and retains all progress, identity, pending question and battle snapshots',()=>{
  let own=fresh(),source=fresh();own.settings.weekdayPassDate='2026-10-19';
  own=execute(own,command('starter',{speciesId:25}),'child',rt).state;
  own=execute(own,command('encounter'),'child',rt).state;
  own=execute(own,command('battle.move',{moveId:own.partners[0].moves[0]}),'child',rt).state;
  source.nickname='来源昵称';source.realName='来源姓名';source.settings.baseExp=301;source.npcs[0].line='新内容';
  source.customWords=[{id:'extra',word:'hello',meaning:'你好',topic:'问候',level:1,example:'Hello!'}];
  const before=structuredClone(own),result=followContent(own,source);
  expect(result).toEqual({...before,npcs:source.npcs,settings:source.settings,customWords:source.customWords,disabledWordIds:source.disabledWordIds});
  expect(own).toEqual(before);expect(result.question).toEqual(before.question);expect(result.battle).toEqual(before.battle);
  result.settings.baseExp++;expect(source.settings.baseExp).toBe(301);
 });
 it('reads new source settings on every request but only commits the follower',async()=>{
  const db=new Store(),source=structuredClone(db.saves.get(home));
  const first=await run(db,'starter',{speciesId:25,familyId:home,content_source_family_id:other});expect(first.ok).toBe(true);
  const progress=structuredClone(db.saves.get(trial)!.state);
  db.saves.get(home)!.state.settings.baseExp=412;db.saves.get(home)!.state.npcs[0].line='更新的对话';
  const next=await run(db,'bootstrap');expect(next.state?.settings.baseExp).toBe(412);expect(next.state?.npcs[0].line).toBe('更新的对话');
  expect(next.state?.partners).toEqual(progress.partners);expect(next.state?.contentMode).toBe('follow');
  expect(db.writes).toEqual([trial,trial]);expect(db.saves.get(home)!.revision).toBe(source!.revision);
  expect(JSON.stringify(next)).not.toContain(home);expect(next.state?.nickname).toBe('测试训练师');
 });
 it('allows trial review/reward and export without touching source progress or granting twice',async()=>{
  const db=new Store(),before=structuredClone(db.saves.get(home));
  await run(db,'starter',{speciesId:25});await run(db,'checkin.submit',{taskIds:['english']});
  const approve=command('parent.review',{date:'2026-10-19',approve:true});
  const result=await gameCommand(approve,'parent',db,rt);expect(result.ok).toBe(true);expect(result.state!.partners[0].exp).toBeGreaterThan(160);
  const revision=result.state!.revision;const again=await gameCommand(approve,'parent',db,rt);
  expect(again.state!.revision).toBe(revision);expect(again.state!.partners).toEqual(result.state!.partners);
  const exported=await run(db,'parent.export',{},'parent');expect(exported.export).toEqual(db.saves.get(trial)!.state);
  expect(db.saves.get(home)).toEqual(before);expect((await run(db,'parent.export')).ok).toBe(false);
 });
 it.each(['parent.settings','parent.tasks','parent.words','parent.word.disable','parent.npc'])('rejects %s for both follower roles',async(type)=>{
  const db=new Store();for(const uid of ['parent','child']){const result=await run(db,type,{baseExp:999,familyId:home},uid);expect(result.ok).toBe(false);expect(result.error).toContain('只能查看');}
  expect(db.writes).toHaveLength(0);
 });
 it('keeps independent family editing and applies latest source configuration on export and operation replay',async()=>{
  const db=new Store();expect((await run(db,'parent.settings',{baseExp:300},'home-parent')).ok).toBe(true);
  const cmd=command('starter',{speciesId:25});await gameCommand(cmd,'child',db,rt);
  db.saves.get(home)!.state.settings.baseExp=400;
  const count=db.writes.length;const replay=await gameCommand(cmd,'child',db,rt);const exp=await run(db,'parent.export',{},'parent');
  expect(replay.state?.settings.baseExp).toBe(400);expect(exp.export?.settings.baseExp).toBe(400);expect(db.writes).toHaveLength(count);
 });
 it('preserves an already generated question when the source word is edited',async()=>{
  const db=new Store();await run(db,'practice.start');const q=structuredClone(db.saves.get(trial)!.state.question!);
  db.saves.get(home)!.state.customWords.push({id:q.wordId,word:q.word,meaning:'修改释义',example:'New example.',topic:'新主题',level:1});
  const refreshed=await run(db,'bootstrap');expect(refreshed.ok).toBe(true);expect(db.saves.get(trial)!.state.question).toEqual(q);
  const answered=await run(db,'answer',{questionId:q.id,optionId:q.correctOptionId});expect(answered.ok).toBe(true);expect(answered.state?.daily.questions).toBe(1);
 });
 it('replays completion feedback without counting the daily answer twice',async()=>{
  const db=new Store();await run(db,'practice.start');const q=db.saves.get(trial)!.state.question!;
  const cmd=command('answer',{questionId:q.id,optionId:q.correctOptionId});
  const first=await gameCommand(cmd,'child',db,rt),replay=await gameCommand(cmd,'child',db,rt);
  expect(first.result?.dailyFeedback?.completed).toBe(1);expect(replay.result).toEqual(first.result);
  expect(replay.state?.revision).toBe(first.state?.revision);expect(replay.state?.daily.questions).toBe(1);
 });
 it('fails closed on missing, chained, self, unavailable or incompatible sources without modifying saves',async()=>{
  for(const variant of ['missing','chain','self','unavailable','references']){
   const db=new Store();
   if(variant==='missing')db.saves.delete(home);
   if(variant==='chain')db.saves.get(home)!.content_source_family_id=other;
   if(variant==='self')db.saves.get(trial)!.content_source_family_id=trial;
   if(variant==='unavailable')db.sourceFailure=true;
   if(variant==='references')db.saves.get(trial)!.state.mastery['removed-word']={correct:1,wrong:0,due:'2026-10-19',stage:1};
   const before=structuredClone(db.saves);expect((await run(db,'bootstrap')).ok).toBe(false);expect(db.saves).toEqual(before);expect(db.writes).toHaveLength(0);
  }
 });
 it('re-reads both configuration and progress after a revision conflict',async()=>{
  const db=new Store();db.conflict=true;const result=await run(db,'starter',{speciesId:25});
  expect(result.ok).toBe(true);expect(result.state?.daily.correct).toBe(2);expect(result.state?.partners).toHaveLength(1);expect(db.writes).toEqual([trial]);
 });
 it('rejects a request started by a different account before looking up or mutating its save',async()=>{
  const db=new Store(),read=vi.spyOn(db,'one');const result=await gameCommand({...command('starter',{speciesId:25}),expectedUid:'child'},'parent',db,rt);
  expect(result.ok).toBe(false);expect(read).not.toHaveBeenCalled();
 });
 it('reads caller identity from each trusted invocation and rejects malformed or anonymous contexts',()=>{
  const context=(uid:string)=>({namespace:'test',environment:JSON.stringify({SCF_NAMESPACE:'test',TCB_UUID:uid})});
  vi.stubEnv('TCB_UUID','old-home-user');
  try{expect(gameCaller(context('trial-user'))).toBe('trial-user');expect(gameCaller(context(''))).toBe('');expect(gameCaller({TCB_UUID:'fake'})).toBe('');expect(gameCaller({namespace:'test',environment:'bad'})).toBe('');expect(gameCaller({namespace:'test',environment:JSON.stringify({SCF_NAMESPACE:'test',TCB_UUID:'anonymous',TCB_ISANONYMOUS_USER:'true'})})).toBe('');}finally{vi.unstubAllEnvs();}
 });
});

describe('content relationship backups',()=>{
 function snapshot():Backup{return {formatVersion:1,envId:'test',appVersion:'0.3.0',reason:'manual',exportedAt:rt.now.toISOString(),saves:[{family_id:home,revision:1,state:fresh(),updated_at:rt.now.toISOString()},{family_id:trial,revision:0,state:fresh(),updated_at:rt.now.toISOString(),content_source_family_id:home}],members:[],operations:[]};}
 it('round-trips the relationship and accepts previous snapshots without it',()=>{
  const backup=snapshot();expect(decodeBackup(gzipSync(JSON.stringify(backup)),'test')).toEqual(backup);
  delete backup.saves[1].content_source_family_id;expect(validateBackup(backup,'test')).toEqual(backup);
 });
 it('rejects dangling, self and chained backup relationships',()=>{
  for(const source of [trial,other]){const b=snapshot();b.saves[1].content_source_family_id=source;expect(()=>validateBackup(b,'test')).toThrow('content source');}
  const b=snapshot();b.saves[0].content_source_family_id=trial;expect(()=>validateBackup(b,'test')).toThrow('content source');
 });
 it('restores state with the existing RPC without modifying the current relationship',async()=>{
  const b=snapshot(),row=b.saves[1],store=new BackupStore('test','test-secret'),current={...row,content_source_family_id:other};
  vi.spyOn(store,'currentFamily').mockResolvedValueOnce(current).mockResolvedValueOnce({...current,revision:1});
  vi.spyOn(store,'snapshot').mockResolvedValue(b);vi.spyOn(store,'uploadVerified').mockResolvedValue({key:'safe',bytes:1,families:2,exportedAt:b.exportedAt});
  const rpc=vi.spyOn(store,'rpc').mockResolvedValue({});await restoreFamily(store,b,trial,0,'0.3.0');
  expect(rpc).toHaveBeenCalledWith('rr_commit',expect.objectContaining({p_family:trial,p_state:row.state}));expect(rpc.mock.calls[0][1]).not.toHaveProperty('content_source_family_id');
 });
});
