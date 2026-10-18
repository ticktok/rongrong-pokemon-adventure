import cloudbase from '@cloudbase/node-sdk';
import { randomUUID, randomInt } from 'node:crypto';
import { z } from 'zod';
import { execute } from './engine';
import { publicState } from './state';
import type { GameState, Role, ApiResponse, ActionResult } from '../src/game/types';
import { PgStore, PgError } from './pg';
const inputSchema=z.object({type:z.string().min(1).max(60),operationId:z.uuid(),payload:z.record(z.string(),z.unknown()).default({})});
const app=cloudbase.init({env:process.env.SCF_NAMESPACE||'wind-d7gesdlb779f8214f'});
const db=new PgStore(process.env.SCF_NAMESPACE||'wind-d7gesdlb779f8214f',()=>process.env.CLOUDBASE_APIKEY??'');
interface SaveRow { state:GameState; revision:number }
interface Member { family_id:string; role:Role }
interface CommitResult extends SaveRow { result:ActionResult }
export async function main(event:unknown):Promise<ApiResponse> {
  try {
    const command=inputSchema.parse(event);
    const {uid}=app.auth().getUserInfo();
    if(!uid)return {ok:false,error:'请先登录家庭账号'};
    const member=await db.one<Member>('rr_members','family_id,role',{uid});
    if(!member)return {ok:false,error:'这个账号还没有加入融融的家庭'};
    const now=new Date();
    for(let attempt=0;attempt<3;attempt++){
      const saved=await db.one<SaveRow>('rr_saves','state,revision',{family_id:member.family_id});
      if(!saved)throw new Error('暂时没有读到云端存档，请稍后重试');
      if(command.type==='parent.export'){
        if(member.role!=='parent')throw new Error('这项操作需要家长登录');
        return {ok:true,export:saved.state,state:publicState(saved.state,member.role,saved.revision,now)};
      }
      const old=await db.one<{result:ActionResult}>('rr_operations','result',{family_id:member.family_id,operation_id:command.operationId});
      if(old)return {ok:true,state:publicState(saved.state,member.role,saved.revision,now),result:old.result};
      const next=execute(saved.state,command,member.role,{now,uuid:randomUUID,random:()=>randomInt(0,1_000_000)/1_000_000});
      try {
        const result=await db.rpc<CommitResult>('rr_commit',{p_family:member.family_id,p_operation:command.operationId,p_revision:saved.revision,p_state:next.state,p_result:next.result});
        return {ok:true,state:publicState(result.state,member.role,result.revision,now),result:result.result};
      } catch(error) {
        if(error instanceof PgError&&error.message.includes('REVISION_CONFLICT'))continue;
        throw error;
      }
    }
    return {ok:false,error:'另一台设备刚刚更新了进度，请刷新后再试'};
  } catch(error:unknown) {
    if(error instanceof z.ZodError)return {ok:false,error:'操作信息不完整，请刷新后重试'};
    if(error instanceof PgError){console.error('pg_error',{code:error.code,message:error.message});return {ok:false,error:'云端保存暂时没有完成，请重试这次操作'};}
    return {ok:false,error:error instanceof Error?error.message:'暂时连接不上，请稍后重试'};
  }
}
