import {BackupStore} from './backup';
import {version} from '../package.json';
export async function main(event:unknown){
  // The function has no public route and is denied to all client identities by gateway policy.
  const reason=typeof event==='object'&&event!==null&&'Type'in event&&event.Type==='Timer'?'daily':'manual';
  const store=new BackupStore(process.env.SCF_NAMESPACE??'',process.env.CLOUDBASE_APIKEY??'');
  const receipt=await store.uploadVerified(await store.snapshot(version,reason));
  console.log(JSON.stringify({event:'backup_verified',...receipt}));
  return {ok:true,...receipt};
}
