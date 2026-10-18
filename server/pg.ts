// @cloudbase/node-sdk 3.18.3 has no rdb() API. Use the documented PG REST/RPC gateway.
// The server API key is injected by CloudBase and is never included in browser output.
export class PgError extends Error { constructor(message:string,public code:string){super(message);} }
export class PgStore {
  constructor(private env:string,private key:()=>string){}
  private async request<T>(path:string,method='GET',body?:unknown):Promise<T>{
    const token=this.key();if(!token)throw new Error('云端存档服务尚未配置');
    const response=await fetch('https://'+this.env+'.api.tcloudbasegateway.com/v1/rdb/rest/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
    const value:unknown=await response.json();
    if(!response.ok){const e=value as {message?:string;code?:string};throw new PgError(e.message??'Database request failed',e.code??String(response.status));}
    return value as T;
  }
  async one<T>(table:string,columns:string,filters:Record<string,string>):Promise<T|null>{
    const query=new URLSearchParams({select:columns,limit:'1'});
    for(const [k,v] of Object.entries(filters))query.set(k,'eq.'+v);
    const rows=await this.request<T[]>(table+'?'+query.toString());return rows[0]??null;
  }
  rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{return this.request<T>('rpc/'+name,'POST',args);}
}
