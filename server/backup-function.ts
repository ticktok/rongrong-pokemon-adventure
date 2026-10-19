import {BackupStore,backupInvocation} from './backup';
import {version} from '../package.json';
export async function main(_event:unknown,context:unknown){
  // SCF supplies context per request. Never authorize from event or stale process-global identity.
  const {envId,reason}=backupInvocation(context);
  const store=new BackupStore(envId,process.env.CLOUDBASE_APIKEY??'');
  const receipt=await store.uploadVerified(await store.snapshot(version,reason));
  console.log(JSON.stringify({event:'backup_verified',...receipt}));
  return {ok:true,...receipt};
}
