import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {initialState,makePartner} from '../server/state';
import {execute} from '../server/engine';
import {validateSave,contentIdentity,compareContent} from '../server/save-validation';
import {BackupStore,decodeBackup,validateBackup,restoreSelection,restoreFamily,assertBackupServerCaller,backupInvocation,type Backup} from '../server/backup';
const env='test-env',family=randomUUID(),now=new Date('2026-10-18T04:00:00Z'),rt={now,random:()=>0.3,uuid:randomUUID};
function state(){const s=initialState([],now);const p=makePartner(25,5,rt);s.started=true;s.partners=[p];s.team=[p.id];s.caught=[25];s.seen=[25];return s;}
function backup():Backup{return {formatVersion:1,envId:env,appVersion:'0.2.0',reason:'release',exportedAt:now.toISOString(),saves:[{family_id:family,revision:8,state:state(),updated_at:now.toISOString()}],members:[{uid:'test-child',family_id:family,role:'child'}],operations:[]};}
describe('save compatibility',()=>{
 it('loads an old save and preserves additive fields and unfinished battle questions',()=>{
  let s=execute(state(),{type:'encounter',operationId:randomUUID(),payload:{}},'child',rt).state;
  s=execute(s,{type:'battle.move',operationId:randomUUID(),payload:{moveId:s.partners[0].moves[0]}},'child',rt).state;
  const saved={...s,futureProgress:{value:12}};
  expect(validateSave(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
 });
 it('permits content additions without changing existing references',()=>{
  const previous=contentIdentity(),expanded=structuredClone(previous);expanded.species[152]='gen2:chikorita';
  expect(compareContent(previous,expanded)).toEqual([]);expect(validateSave(state(),expanded).team).toHaveLength(1);
 });
 it('detects reassigned word, species and move identifiers and removed regions',()=>{
  const old=contentIdentity(),next=structuredClone(old);next.words['word-1-1']='blue';next.species[25]='gen1:raichu';next.moves['normal-0']='normal:别的招式';delete next.regions['home-meadow'];
  expect(compareContent(old,next)).toHaveLength(4);
 });
 it('rejects missing partners, words, battle references and unsupported schemas',()=>{
  const s=state();s.team=['not-present'];expect(()=>validateSave(s)).toThrow('reference');
  const w=state();w.mastery.missing={correct:1,wrong:0,due:'2026-10-20',stage:1};expect(()=>validateSave(w)).toThrow('word ID');
  expect(()=>validateSave({...state(),schemaVersion:2})).toThrow('structure');
 });
});
describe('backup and recovery',()=>{
 it('round-trips every save field without stripping unknown fields',()=>{
  const b=backup();Object.assign(b.saves[0].state,{future:{score:9}});expect(decodeBackup(gzipSync(JSON.stringify(b)),env)).toEqual(b);
 });
 it('rejects corrupted files, incomplete records, wrong environments and duplicate families',()=>{
  expect(()=>decodeBackup(Buffer.from('bad JSON'),env)).toThrow();
  const b=backup();expect(()=>decodeBackup(gzipSync(JSON.stringify(b)).subarray(0,20),env)).toThrow();
  expect(()=>validateBackup({...b,saves:[{...b.saves[0],state:{}}]},env)).toThrow();
  expect(()=>validateBackup(b,'another-env')).toThrow('environment');
  expect(()=>validateBackup({...b,saves:[...b.saves,...b.saves]},env)).toThrow('Duplicate');
 });
 it('does not remap families or accept a stale restore revision',()=>{
  const b=backup();expect(()=>restoreSelection(b,randomUUID(),{family_id:family,revision:10},10)).toThrow('family');
  expect(()=>restoreSelection(b,family,{family_id:family,revision:11},10)).toThrow('REVISION_CONFLICT');
 });
 it('requires successful upload and identical downloaded content',async()=>{
  const b=backup();b.exportedAt='2026-10-18T12:00:00+08:00';let stored=new Uint8Array();
  const transport:typeof fetch=async(_url,init)=>{if(init?.method==='POST'){stored=new Uint8Array(await new Response(init.body).arrayBuffer());return new Response('{}');}return new Response(stored);};
  const store=new BackupStore(env,'test-secret',transport);expect((await store.uploadVerified(b)).families).toBe(1);
  await expect(new BackupStore(env,'test-secret',async()=>new Response('',{status:503})).uploadVerified(b)).rejects.toThrow('503');
  const changed=structuredClone(b);changed.saves[0].state.partners[0].exp++;
  await expect(new BackupStore(env,'test-secret',async(_u,i)=>i?.method==='POST'?new Response('{}'):new Response(new Uint8Array(gzipSync(JSON.stringify(changed))))).uploadVerified(b)).rejects.toThrow('readback');
 });
 it('never commits a restore if its safety backup fails',async()=>{
  const b=backup(),store=new BackupStore(env,'test-secret');
  vi.spyOn(store,'currentFamily').mockResolvedValue(b.saves[0]);vi.spyOn(store,'snapshot').mockResolvedValue(b);vi.spyOn(store,'uploadVerified').mockRejectedValue(new Error('upload failed'));const rpc=vi.spyOn(store,'rpc');
  await expect(restoreFamily(store,b,family,8,'0.2.0')).rejects.toThrow('upload failed');expect(rpc).not.toHaveBeenCalled();
 });
 it('passes the original revision to the transaction after concurrent writes during backup',async()=>{
  const b=backup(),store=new BackupStore(env,'test-secret');
  vi.spyOn(store,'currentFamily').mockResolvedValue(b.saves[0]);vi.spyOn(store,'snapshot').mockResolvedValue(b);vi.spyOn(store,'uploadVerified').mockResolvedValue({key:'safety.json.gz',bytes:123,families:1,exportedAt:b.exportedAt});
  const rpc=vi.spyOn(store,'rpc').mockRejectedValue(new Error('REVISION_CONFLICT'));
  await expect(restoreFamily(store,b,family,8,'0.2.0')).rejects.toThrow('REVISION_CONFLICT');expect(rpc).toHaveBeenCalledWith('rr_commit',expect.objectContaining({p_revision:8,p_family:family}));
 });
});

describe('backup caller identity',()=>{
 it('rejects authenticated and anonymous client identities even with a forged timer payload',()=>{
  const server={uid:'',openId:'',customUserId:'',isAnonymous:false};
  expect(()=>assertBackupServerCaller(server)).not.toThrow();
  for(const change of [{uid:'child'},{openId:'wx-user'},{customUserId:'user'},{isAnonymous:true}])expect(()=>assertBackupServerCaller({...server,...change})).toThrow('BACKUP_SERVER_ONLY');
 });
});

describe('per-request SCF authorization',()=>{
 it('does not carry a client identity into a subsequent admin or timer invocation',()=>{
  const context=(extra:Record<string,unknown>={})=>({namespace:env,environment:JSON.stringify({SCF_NAMESPACE:env,...extra})});
  expect(()=>backupInvocation(context({TCB_UUID:'child'}))).toThrow('BACKUP_SERVER_ONLY');
  vi.stubEnv('TCB_UUID','previous-client');vi.stubEnv('TCB_CONTEXT_KEYS','TCB_UUID');
  try{
    expect(backupInvocation(context())).toEqual({envId:env,reason:'manual'});
    expect(backupInvocation(context({TRIGGER_SRC:'timer'}))).toEqual({envId:env,reason:'daily'});
  }finally{vi.unstubAllEnvs();}
 });
 it('rejects absent or malformed trusted context instead of trusting request data',()=>{
  expect(()=>backupInvocation({Type:'Timer'})).toThrow();
  expect(()=>backupInvocation({namespace:env,environment:'{}'})).toThrow();
  expect(()=>backupInvocation({namespace:env,environment:'not json'})).toThrow();
 });
});
