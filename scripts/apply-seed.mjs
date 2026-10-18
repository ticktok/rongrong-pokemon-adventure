import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const statements=JSON.parse(await readFile('private/seed-statements.json','utf8'));
for(const Sql of statements){
  const output=execFileSync(process.execPath,['node_modules/@cloudbase/cli/bin/tcb','api','tcb','ExecutePGSql','--body',JSON.stringify({EnvId:'wind-d7gesdlb779f8214f',Sql}),'--env-id','wind-d7gesdlb779f8214f','--json'],{encoding:'utf8'});
  const result=JSON.parse(output.slice(output.indexOf('{')));
  if(result.error||result.data?.Error)throw new Error('Seed failed: '+JSON.stringify(result.error??result.data.Error));
  console.log('Seed statement completed.');
}
