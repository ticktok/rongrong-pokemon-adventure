import {z} from 'zod';
import {execute} from './engine';
import {publicState,type Runtime} from './state';
import {followContent,requireOwnContent} from './follow-content';
import {PgError,type PgStore} from './pg';
import type {GameState,Role,ApiResponse,ActionResult} from '../src/game/types';

const inputSchema=z.object({type:z.string().min(1).max(60),operationId:z.uuid(),payload:z.record(z.string(),z.unknown()).default({}),expectedUid:z.string().min(1).optional()});
export interface SaveRow {state:GameState;revision:number;content_source_family_id?:string|null}
interface Member {family_id:string;role:Role}
interface CommitResult extends SaveRow {result:ActionResult}
export type GameStore=Pick<PgStore,'one'|'rpc'>;

export async function gameCommand(event:unknown,uid:string,db:GameStore,rt:Runtime):Promise<ApiResponse>{
  try{
    const command=inputSchema.parse(event);
    if(!uid)return {ok:false,error:'请先登录家庭账号'};
    if(command.expectedUid&&command.expectedUid!==uid)return {ok:false,error:'账号已切换，请在当前账号重新操作'};
    const member=await db.one<Member>('rr_members','family_id,role',{uid});
    if(!member)return {ok:false,error:'这个账号还没有加入家庭'};
    for(let attempt=0;attempt<3;attempt++){
      const saved=await db.one<SaveRow>('rr_saves','state,revision,content_source_family_id',{family_id:member.family_id});
      if(!saved)throw new Error('暂时没有读到云端存档，请稍后重试');
      const sourceId=saved.content_source_family_id,following=!!sourceId;
      requireOwnContent(command,following);
      let state=saved.state;
      if(sourceId){
        if(sourceId===member.family_id)throw new Error('内容跟随关系无效，请联系家长检查');
        let source:SaveRow|null;
        try{source=await db.one<SaveRow>('rr_saves','state,revision,content_source_family_id',{family_id:sourceId});}
        catch{throw new Error('暂时无法读取跟随内容，测试进度已保留，请稍后重试');}
        if(!source||source.content_source_family_id)throw new Error('内容来源不存在或不能继续跟随，测试进度已保留');
        state=followContent(saved.state,source.state);
      }
      const view=(value:GameState,revision:number)=>({...publicState(value,member.role,revision,rt.now),contentMode:following?'follow' as const:'own' as const});
      if(command.type==='parent.export'){
        if(member.role!=='parent')throw new Error('这项操作需要家长登录');
        return {ok:true,export:state,state:view(state,saved.revision)};
      }
      const old=await db.one<{result:ActionResult}>('rr_operations','result',{family_id:member.family_id,operation_id:command.operationId});
      if(old)return {ok:true,state:view(state,saved.revision),result:{...old.result,battlePlayback:undefined}};
      if((command.type==='team.update'||command.type.startsWith('box.'))&&command.payload.expectedRevision!==saved.revision){
        return {ok:false,error:'伙伴位置已更新，请根据最新队伍重新选择',state:view(state,saved.revision)};
      }
      const next=execute(state,command,member.role,rt);
      try{
        const result=await db.rpc<CommitResult>('rr_commit',{p_family:member.family_id,p_operation:command.operationId,p_revision:saved.revision,p_state:next.state,p_result:next.result});
        return {ok:true,state:view(result.state,result.revision),result:result.result};
      }catch(error){
        if(error instanceof PgError&&error.message.includes('REVISION_CONFLICT'))continue;
        throw error;
      }
    }
    return {ok:false,error:'另一台设备刚刚更新了进度，请刷新后再试'};
  }catch(error:unknown){
    if(error instanceof z.ZodError)return {ok:false,error:'操作信息不完整，请刷新后重试'};
    if(error instanceof PgError){console.error('pg_error',{code:error.code});return {ok:false,error:'云端保存暂时没有完成，请重试这次操作'};}
    return {ok:false,error:error instanceof Error?error.message:'暂时连接不上，请稍后重试'};
  }
}

// Read the trusted invocation context, never a warm process's previous identity or event payload.
export function gameCaller(context:unknown):string {
  const parsed=z.object({namespace:z.string().min(1),environment:z.string()}).safeParse(context);
  if(!parsed.success)return '';
  try{
    const env=z.record(z.string(),z.unknown()).parse(JSON.parse(parsed.data.environment));
    if(env.SCF_NAMESPACE!==parsed.data.namespace||env.TCB_ISANONYMOUS_USER===true||env.TCB_ISANONYMOUS_USER==='true')return '';
    return typeof env.TCB_UUID==='string'?env.TCB_UUID:'';
  }catch{return '';}
}
