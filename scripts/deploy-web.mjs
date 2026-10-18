import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const config=JSON.parse(await readFile('cloudbaserc.json','utf8'));
const stage={envId:config.envId,app:{serviceName:config.app.serviceName,framework:'static',root:'.',installCommand:'',buildCommand:'',outputDir:'./',deployPath:config.app.deployPath,ignore:['cloudbaserc.json']}};
await writeFile('dist/cloudbaserc.json',JSON.stringify(stage,null,2));
// Package only the built website. Family data, credentials and source-side operations stay outside dist.
const child=spawn(process.execPath,[resolve('node_modules/@cloudbase/cli/bin/tcb'),'app','deploy',config.app.serviceName,'--env-id',config.envId,'--framework','static','--install-command','','--build-command','','--output-dir','./','--deploy-path',config.app.deployPath,'--ignore','cloudbaserc.json','--yes','--json'],{cwd:resolve('dist'),stdio:'inherit'});
child.on('exit',code=>process.exitCode=code??1);
