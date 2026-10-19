import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {validateSave} from './save-validation';

export const BACKUP_BUCKET='rongrong-save-backups';
const rowSchema=z.object({family_id:z.uuid(),revision:z.number().int().nonnegative().safe(),state:z.unknown(),updated_at:z.string().min(1)}).passthrough();
const snapshotSchema=z.object({exportedAt:z.string().min(1),saves:z.array(rowSchema).min(1),members:z.array(z.object({uid:z.string().min(1),family_id:z.uuid(),role:z.enum(['parent','child'])}).passthrough()),operations:z.array(z.object({family_id:z.uuid(),operation_id:z.uuid(),result:z.record(z.string(),z.unknown()),created_at:z.string().min(1)}).passthrough())}).passthrough();
const backupSchema=snapshotSchema.extend({formatVersion:z.literal(1),envId:z.string().min(1),appVersion:z.string().min(1),reason:z.enum(['daily','release','manual','pre-restore'])});
export type Backup=z.infer<typeof backupSchema>&{saves:(z.infer<typeof rowSchema>&{state:ReturnType<typeof validateSave>})[]};
export function validateBackup(value:unknown,envId:string):Backup{
  const parsed=backupSchema.safeParse(value);if(!parsed.success)throw new Error('Invalid backup format');
  const b=parsed.data;if(b.envId!==envId)throw new Error('Backup environment mismatch');
  if(!Number.isFinite(Date.parse(b.exportedAt)))throw new Error('Invalid backup timestamp');
  const families=new Set(b.saves.map(s=>s.family_id));
  if(families.size!==b.saves.length)throw new Error('Duplicate backup families');
  if(new Set(b.members.map(m=>m.uid)).size!==b.members.length)throw new Error('Duplicate backup members');
  if(new Set(b.operations.map(o=>o.family_id+':'+o.operation_id)).size!==b.operations.length)throw new Error('Duplicate backup operations');
  if([...b.members,...b.operations].some(r=>!families.has(r.family_id)))throw new Error('Backup references a missing family');
  return {...b,saves:b.saves.map(s=>({...s,state:validateSave(s.state)}))};
}
export function decodeBackup(bytes:Uint8Array,envId:string){
  const text=bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes,{maxOutputLength:100*1024*1024}).toString('utf8'):Buffer.from(bytes).toString('utf8');
  return validateBackup(JSON.parse(text),envId);
}
export class BackupStore{
  readonly root:string;
  constructor(readonly envId:string,private apiKey:string,private transport:typeof fetch=fetch){
    if(!apiKey)throw new Error('Missing server credential');this.root='https://'+envId+'.api.tcloudbasegateway.com';
  }
  private async request(path:string,init:RequestInit={}){
    const response=await this.transport(this.root+path,{...init,headers:{Authorization:'Bearer '+this.apiKey,...init.headers},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Cloud backup request failed: HTTP '+response.status+' '+path.split('?')[0]);
    return response;
  }
  async rpc(name:string,body:unknown){return (await this.request('/v1/rdb/rest/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json() as Promise<unknown>;}
  async snapshot(appVersion:string,reason:Backup['reason']):Promise<Backup>{
    const snapshot=snapshotSchema.parse(await this.rpc('rr_export_backup',{}));
    return validateBackup({...snapshot,formatVersion:1,envId:this.envId,appVersion,reason},this.envId);
  }
  private objectPath(key:string){
    if(!/^[a-zA-Z0-9/_\-.]+$/.test(key)||key.split('/').includes('..'))throw new Error('Invalid backup object key');
    return '/v1/storages/object/'+BACKUP_BUCKET+'/'+key;
  }
  async latestDailyKey(){
    const response=await this.request('/v1/storages/object/list/'+BACKUP_BUCKET,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:'daily/',limit:1,with_delimiter:false,sortBy:{column:'name',order:'desc'}})});
    const data=z.object({objects:z.array(z.object({name:z.string()}))}).parse(await response.json());
    if(!data.objects.length)throw new Error('No daily backup found');
    return data.objects[0].name;
  }
  async download(key:string){return new Uint8Array(await (await this.request(this.objectPath(key))).arrayBuffer());}
  async uploadVerified(backup:Backup){
    const checked=validateBackup(backup,this.envId),date=new Date(checked.exportedAt).toISOString().replaceAll(':','-');
    const key=`${checked.reason}/${date}-${randomUUID()}.json.gz`,bytes=gzipSync(JSON.stringify(checked));
    await this.request(this.objectPath(key),{method:'POST',headers:{'Content-Type':'application/gzip','x-upsert':'false'},body:new Uint8Array(bytes)});
    const restored=decodeBackup(await this.download(key),this.envId);
    if(!isDeepStrictEqual(restored,checked))throw new Error('Backup readback does not match exported snapshot');
    return {key,bytes:bytes.length,families:checked.saves.length,exportedAt:checked.exportedAt};
  }
  async currentFamily(familyId:string){
    z.uuid().parse(familyId);
    const data:unknown=await (await this.request('/v1/rdb/rest/rr_saves?select=*&family_id=eq.'+familyId)).json();
    const rows=z.array(rowSchema).length(1).parse(data);return {...rows[0],state:validateSave(rows[0].state)};
  }
}
export function restoreSelection(backup:Backup,familyId:string,current:{family_id:string;revision:number},expectedRevision:number){
  const row=backup.saves.find(s=>s.family_id===familyId);
  if(!row||current.family_id!==familyId)throw new Error('Restore family mismatch');
  if(current.revision!==expectedRevision)throw new Error('REVISION_CONFLICT');
  return validateSave(row.state);
}
export async function restoreFamily(store:BackupStore,backup:Backup,familyId:string,expectedRevision:number,appVersion:string){
  validateBackup(backup,store.envId);
  const current=await store.currentFamily(familyId),state=restoreSelection(backup,familyId,current,expectedRevision);
  const safety=await store.snapshot(appVersion,'pre-restore');
  const receipt=await store.uploadVerified(safety);
  // rr_commit locks the row and checks expectedRevision again after the safety backup.
  await store.rpc('rr_commit',{p_family:familyId,p_operation:randomUUID(),p_revision:expectedRevision,p_state:state,p_result:{message:'从已验证备份恢复家庭存档'}});
  const saved=await store.currentFamily(familyId);
  if(saved.revision!==expectedRevision+1||!isDeepStrictEqual(saved.state,state))throw new Error('Restore readback changed; inspect current save without retrying restore');
  return {revision:saved.revision,safetyBackup:receipt};
}

export function assertBackupServerCaller(identity:{uid:string;openId:string;customUserId:string;isAnonymous:boolean}){
  if(identity.uid||identity.openId||identity.customUserId||identity.isAnonymous)throw new Error('BACKUP_SERVER_ONLY');
}

export function backupInvocation(context:unknown):{envId:string;reason:'daily'|'manual'}{
  const invocation=z.object({namespace:z.string().min(1),environment:z.string()}).parse(context);
  const environment=z.record(z.string(),z.unknown()).parse(JSON.parse(invocation.environment));
  if(environment.SCF_NAMESPACE!==invocation.namespace)throw new Error('Invalid invocation environment');
  assertBackupServerCaller({
    uid:typeof environment.TCB_UUID==='string'?environment.TCB_UUID:'',
    openId:typeof environment.WX_OPENID==='string'?environment.WX_OPENID:'',
    customUserId:typeof environment.TCB_CUSTOM_USER_ID==='string'?environment.TCB_CUSTOM_USER_ID:'',
    isAnonymous:environment.TCB_ISANONYMOUS_USER==='true'||environment.TCB_ISANONYMOUS_USER===true,
  });
  return {envId:invocation.namespace,reason:environment.TRIGGER_SRC==='timer'?'daily':'manual'};
}
