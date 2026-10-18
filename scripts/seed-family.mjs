import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
await mkdir('private',{recursive:true});
await build({entryPoints:['server/state.ts'],outfile:'private/state.mjs',bundle:true,platform:'node',format:'esm'});
const {initialState}=await import('../private/state.mjs');
const accounts=JSON.parse(await readFile('private/account-identities.json','utf8'));
const npcs=JSON.parse(await readFile('private/roster.json','utf8'));
const profile=JSON.parse(await readFile('private/profile.json','utf8'));
const path='private/family-seed.json';
let families;
try{families=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;families={home:randomUUID(),qa:randomUUID()};await writeFile(path,JSON.stringify(families),{mode:0o600});}
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const statements=[];
for(const [key,id] of Object.entries(families)){
 const state=initialState(key==='home'?npcs:npcs.map((n,i)=>({...n,name:n.kind==='family'?n.name:'测试同学'+(i+1)})),new Date(),key==='home'?profile.nickname:'测试训练师',key==='home'?profile.realName:'测试账号');
 statements.push('INSERT INTO public.rr_saves(family_id,state) VALUES('+quote(id)+','+quote(JSON.stringify(state))+'::jsonb) ON CONFLICT(family_id) DO NOTHING;');
}
for(const a of accounts)statements.push('INSERT INTO public.rr_members(uid,family_id,role) VALUES('+[a.uid,families[a.family],a.role].map(quote).join(',')+') ON CONFLICT(uid) DO NOTHING;');
await writeFile('private/seed-statements.json',JSON.stringify(statements),{mode:0o600});
await writeFile('private/roster.json',JSON.stringify(npcs,null,2),{mode:0o600});
console.log('Prepared',npcs.length,'NPCs and',accounts.length,'identities. No remote changes.');
