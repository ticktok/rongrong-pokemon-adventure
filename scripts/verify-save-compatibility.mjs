import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {build} from 'esbuild';
import {loadOps,settings} from './ops-lib.mjs';
const {values}=parseArgs({options:{ref:{type:'string'},file:{type:'string'},'content-only':{type:'boolean',default:false}}});
const ref=values.ref??execFileSync('git',['describe','--tags','--abbrev=0'],{encoding:'utf8'}).trim();
execFileSync('git',['rev-parse','--verify',ref+'^{commit}'],{stdio:'ignore'});
const gitRead=file=>execFileSync('git',['show',ref+':'+file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const previous=await build({stdin:{contents:"export * from './content/packs'; export {MOVES} from './content/world'; export {default as words} from './content/words.json';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'read-previous-release',setup(b){
 b.onResolve({filter:/^\./},args=>{
  const relative=path.posix.normalize(path.posix.join(args.importer?path.posix.dirname(args.importer):'',args.path));
  for(const file of [relative,relative+'.ts',relative+'.json']){try{gitRead(file);return {path:file,namespace:'previous'};}catch{}}
  throw new Error('Cannot read previous content module: '+relative);
 });
 b.onLoad({filter:/.*/,namespace:'previous'},args=>({contents:gitRead(args.path),loader:args.path.endsWith('.json')?'json':'ts'}));
}}]});
const old=await import('data:text/javascript;base64,'+Buffer.from(previous.outputFiles[0].text).toString('base64'));
const identity={species:Object.fromEntries(old.PACKS.flatMap(p=>p.species.map(s=>[s.id,p.id+':'+s.english]))),regions:Object.fromEntries(old.PACKS.flatMap(p=>p.regions.map(r=>[r.id,p.id+':'+r.name]))),words:Object.fromEntries(old.words.map(w=>[w.id,w.word.toLowerCase()])),moves:Object.fromEntries(old.MOVES.map(m=>[m.id,m.type+':'+m.name]))};
const {compareContent,validateSave,decodeBackup}=await loadOps();
const problems=compareContent(identity);if(problems.length)throw new Error(problems.join('\n'));
console.log('Content identities remain compatible with',ref);
if(!values['content-only']){
 const {envId,apiKey}=await settings();let rows;
 if(values.file){
  const bytes=await readFile(values.file);
  if(bytes[0]===0x1f)rows=decodeBackup(bytes,envId).saves;
  else {const data=JSON.parse(bytes);if((data.envId??data.env)!==envId)throw new Error('Backup environment mismatch');rows=data.saves;}
 }else{
  const response=await fetch('https://'+envId+'.api.tcloudbasegateway.com/v1/rdb/rest/rr_saves?select=family_id,revision,state',{headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Save read failed: HTTP '+response.status);rows=await response.json();
 }
 if(!Array.isArray(rows)||!rows.length)throw new Error('No saves to verify');
 for(const row of rows)validateSave(row.state);
 console.log('Validated current content references in',rows.length,'family saves; no writes performed.');
}
