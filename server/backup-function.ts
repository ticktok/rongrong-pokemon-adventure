import cloudbase from '@cloudbase/node-sdk';
import {BackupStore,assertBackupServerCaller} from './backup';
import {version} from '../package.json';
const app=cloudbase.init({env:process.env.SCF_NAMESPACE});
export async function main(event:unknown){
  assertBackupServerCaller(app.auth().getUserInfo());
  // SDK Cloud API clients are rejected above; gateway policy separately denies HTTP clients.
  const reason=typeof event==='object'&&event!==null&&'Type'in event&&event.Type==='Timer'?'daily':'manual';
  const store=new BackupStore(process.env.SCF_NAMESPACE??'',process.env.CLOUDBASE_APIKEY??'');
  const receipt=await store.uploadVerified(await store.snapshot(version,reason));
  console.log(JSON.stringify({event:'backup_verified',...receipt}));
  return {ok:true,...receipt};
}
