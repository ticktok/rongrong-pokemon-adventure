import cloudbase from '@cloudbase/js-sdk';
import type {ApiResponse,GameCommand,PublicState} from './game/types';
export const cloud=cloudbase.init({env:import.meta.env.VITE_CLOUDBASE_ENV_ID,region:'ap-shanghai',accessKey:import.meta.env.VITE_PUBLISHABLE_KEY});
export const auth=cloud.auth;
export function asset(kind:'art'|'front'|'back',id:number){return import.meta.env.BASE_URL+'assets/pokemon/'+kind+'/'+id+'.png';}
export function safeResponse(value:unknown):ApiResponse{
  const v:unknown=typeof value==='string'?JSON.parse(value):value;
  if(!v||typeof v!=='object'||!('ok'in v)||typeof v.ok!=='boolean')throw new Error('云端返回了无法识别的结果，请重试');
  return v as ApiResponse;
}
export async function request(command:GameCommand,expectedUid?:string):Promise<ApiResponse>{
  if(!navigator.onLine)throw new Error('网络断开了。进度留在云端，连接后点“重试”继续。');
  const {data,error}=await auth.getSession();
  if(error||!data?.session||data.session.user.is_anonymous)throw new Error('登录已过期，请重新登录');
  const uid=String(data.session.user.id);
  if(expectedUid&&expectedUid!==uid)throw new Error('账号已切换，请在当前账号重新操作');
  const response=await cloud.callFunction({name:'rongrong-game',data:{...command,expectedUid:expectedUid??uid}});
  return safeResponse(response.result);
}
export function saveFile(name:string,value:unknown){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function dueWords(state:PublicState){return Object.entries(state.mastery).filter(([,m])=>m.due<=state.today).length;}
export type Run=(type:string,payload?:Record<string,unknown>)=>Promise<ApiResponse|undefined>;
