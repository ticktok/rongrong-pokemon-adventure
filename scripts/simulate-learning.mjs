// Compare real schedulers against a Git release, using synthetic learners only.
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const ref=process.argv[2]??'v0.7.0';
const entry="export {makeQuestion,recordFirst} from './server/quiz'; export {initialState,dayOf,dateShift,newDaily} from './server/state'; export {WORDS,questionWords} from './server/game-data';";
const gitRead=file=>execFileSync('git',['show',ref+':'+file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
async function load(previous){
 const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:previous?[{name:'git-release',setup(b){
  b.onResolve({filter:/^\./},a=>{const base=path.posix.normalize(path.posix.join(a.importer?path.posix.dirname(a.importer):'',a.path));for(const file of [base,base+'.ts',base+'.json']){try{gitRead(file);return {path:file,namespace:'git-release'};}catch{}}throw Error('Missing Git source '+base);});
  b.onLoad({filter:/.*/,namespace:'git-release'},a=>({contents:gitRead(a.path),loader:a.path.endsWith('.json')?'json':'ts'}));
 }}]:[]});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const previous=await load(true),current=await load(false);
function simulate(api,seed){
 const random=rng(seed),outcomes=rng(seed+1),start='2026-11-08';let sequence=0;
 const s=api.initialState([],new Date(start+'T04:00:00Z'));
 // 80 due, 120 already-correct not-yet-due, and 256 unseen words.
 api.WORDS.slice(0,200).forEach((w,i)=>s.mastery[w.id]={correct:6,wrong:1,due:api.dateShift(start,i<80?-3:10),stage:3});
 const initial=new Set(Object.keys(s.mastery)),encounters=new Map(),covered=new Set();let total=0,premature=0,avoidablePremature=0,shortRepeats=0,delay=0,reviews=0;const recent=[];
 for(let day=0;day<60;day++){
  const date=api.dateShift(start,day),rt={now:new Date(date+'T04:00:00Z'),random,uuid:()=>String(++sequence)};s.daily=api.newDaily(date);
  for(let n=0;n<16;n++){
   const kind=n<10?'daily':['battle','catch','npc'][n%3],before=s.mastery;
   const available=api.questionWords(s).filter(w=>kind!=='daily'||!s.daily.completedIds.includes(w.id));
   const hasPriority=available.some(w=>!before[w.id]||before[w.id].due<=date);
   const q=api.makeQuestion(s,kind,rt),old=before[q.wordId];total++;
   if(old&&old.due>date){premature++;if(hasPriority)avoidablePremature++;}
   if(recent.includes(q.wordId))shortRepeats++;recent.push(q.wordId);if(recent.length>3)recent.shift();
   if(old&&old.due<=date){delay+=(Date.parse(date)-Date.parse(old.due))/86400000;reviews++;}
   if(!initial.has(q.wordId))covered.add(q.wordId);
   const seen=encounters.get(q.wordId)??0,correct=outcomes()<(seen===0?0.65:0.85);encounters.set(q.wordId,seen+1);
   api.recordFirst(s,q,correct,rt);
   if(kind==='daily'){s.daily.questions++;s.daily.completedIds.push(q.wordId);if(correct)s.daily.correct++;if(q.learningPool==='new')s.daily.newWordCount=(s.daily.newWordCount??0)+1;}
  }
 }
 return {seed,days:60,questions:total,newWordsCovered:covered.size,premature,prematureRate:premature/total,avoidablePremature,shortRepeats,meanDueWaitDays:reviews?delay/reviews:0};
}
const runs=[42,2026,456].map(seed=>({previous:simulate(previous,seed),adaptive:simulate(current,seed)}));
for(const run of runs)assert.equal(run.adaptive.avoidablePremature,0);
const report={comparisonRef:ref,scenario:'Synthetic fixed-seed outcomes, 10 daily plus 6 game questions/day; not a claim about real learning efficacy',runs};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/learning-simulation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
