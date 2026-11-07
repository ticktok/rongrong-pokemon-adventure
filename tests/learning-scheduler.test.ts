import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {WORDS,questionWords} from '../server/game-data';
import {initialState,dayOf,dateShift,publicState} from '../server/state';
import {execute} from '../server/engine';
import {makeQuestion,recordFirst} from '../server/quiz';
import {selectLearningWord,selectionWeight,updateMemory} from '../server/learning-scheduler';
import {validateSave} from '../server/save-validation';
import {followContent} from '../server/follow-content';
import type {GameState,Mastery} from '../src/game/types';

const now=new Date('2026-11-07T04:00:00Z'),today=dayOf(now);
function random(seed=42){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const runtime=()=>({now,uuid:randomUUID,random:random()});
const legacy=(due=today):Mastery=>({correct:5,wrong:1,due,stage:2});
function answer(s:GameState,correct=true){const q=s.question!;return execute(s,{type:'answer',operationId:randomUUID(),payload:{questionId:q.id,optionId:correct?q.correctOptionId:q.options.find(o=>o.id!==q.correctOptionId)!.id}},'child',runtime()).state;}
function mixed(){const s=initialState([],now);for(const w of WORDS)s.mastery[w.id]=legacy('2027-01-01');for(const w of WORDS.slice(0,20))delete s.mastery[w.id];for(const w of WORDS.slice(20,40))s.mastery[w.id]=legacy();return s;}
describe('adaptive word selection',()=>{
 it('allocates exactly four new and six due questions with ample pools, without daily repeats',()=>{
  let s=mixed();const categories:string[]=[],ids:string[]=[];
  for(let i=0;i<10;i++){s=execute(s,{type:'practice.start',payload:{},operationId:randomUUID()},'child',runtime()).state;categories.push(s.question!.learningPool!);ids.push(s.question!.wordId);s=answer(s);}
  expect(categories.filter(x=>x==='new')).toHaveLength(4);expect(categories.filter(x=>x==='due')).toHaveLength(6);expect(new Set(ids).size).toBe(10);expect(s.daily.newWordCount).toBe(4);
 });
 it.each(['daily','battle','catch','npc'] as const)('%s never draws familiar words while new or due words exist',kind=>{
  const s=mixed(),rt=runtime();
  for(let i=0;i<100;i++){const q=makeQuestion(s,kind,rt);expect(q.learningPool).not.toBe('familiar');}
 });
 it('keeps the shared three-question cooldown across modes',()=>{
  const s=mixed(),rt=runtime();
  for(const kind of ['daily','npc','battle','catch','review'] as const){const before=[...(s.recentWordIds??[])];const q=makeQuestion(s,kind,rt);expect(before).not.toContain(q.wordId);expect(s.recentWordIds?.at(-1)).toBe(q.wordId);}
  expect(s.recentWordIds).toHaveLength(3);
 });
 it('does not allow cooldown to promote a familiar word over the only due word',()=>{
  const s=initialState([],now);for(const w of WORDS)s.mastery[w.id]=legacy('2027-01-01');s.mastery[WORDS[0].id].due=today;s.recentWordIds=[WORDS[0].id];
  expect(makeQuestion(s,'battle',runtime()).wordId).toBe(WORDS[0].id);
 });
 it.each(['all-new','all-due','all-familiar'] as const)('fills a small bank when %s',mode=>{
  const s=initialState([],now),words=WORDS.slice(0,4);if(mode!=='all-new')for(const w of words)s.mastery[w.id]=legacy(mode==='all-due'?today:'2027-01-01');
  s.recentWordIds=words.slice(0,3).map(w=>w.id);
  expect(selectLearningWord(s,words,'battle',runtime()).word.id).toBe(words[3].id);
  s.recentWordIds=[words[0].id];expect(selectLearningWord(s,words.slice(0,1),'battle',runtime()).word.id).toBe(words[0].id);
 });
 it('keeps review mode due-only and public counts aligned with enabled, answerable words',()=>{
  const s=mixed();s.disabledWordIds=WORDS.slice(20,30).map(w=>w.id);
  const expected=questionWords(s).filter(w=>s.mastery[w.id]?.due<=today).length;expect(publicState(s,'child',0,now).reviewCount).toBe(expected);
  for(let i=0;i<20;i++)expect(makeQuestion(s,'review',runtime()).learningPool).toBe('due');
  for(const m of Object.values(s.mastery))m.due='2027-01-01';expect(()=>makeQuestion(s,'review',runtime())).toThrow('已经完成');
 });
 it('weights overdue legacy words and weak FSRS memories without equal-weighting familiar successes',()=>{
  expect(selectionWeight(legacy('2026-10-08'),today,'due')).toBe(31);
  const m=legacy();updateMemory(m,true,today);expect(selectionWeight(m,today,'familiar')).toBeCloseTo(0.01);
  const s=initialState([],now);s.mastery[WORDS[0].id]=legacy(today);s.mastery[WORDS[1].id]=legacy('2026-10-08');const rt=runtime();let overdue=0;
  for(let i=0;i<2000;i++)if(selectLearningWord(s,WORDS.slice(0,2),'review',rt).word.id===WORDS[1].id)overdue++;
  expect(overdue).toBeGreaterThan(1850);expect(overdue).toBeLessThan(1990);
 });
 it('does not expose recent word IDs or the pending question category to clients',()=>{
  const s=mixed();s.question=makeQuestion(s,'daily',runtime());const view=publicState(s,'child',0,now);
  expect(view).not.toHaveProperty('recentWordIds');expect(view.question).not.toHaveProperty('learningPool');expect(view.question).not.toHaveProperty('wordId');
 });
});
describe('FSRS memory and compatibility',()=>{
 it('extends successful intervals and clamps the final result at 365 days',()=>{
  const m=legacy();let date=today,last=0;
  for(let i=0;i<8;i++){updateMemory(m,true,date);const days=m.fsrs!.card.scheduled_days;expect(days).toBeGreaterThanOrEqual(last);expect(days).toBeLessThanOrEqual(365);last=days;date=m.due;}
  expect(last).toBe(365);
 });
 it('records failure for tomorrow, does not reward correction, and permits later same-day failure',()=>{
  const m=legacy();updateMemory(m,true,today);const good=structuredClone(m.fsrs);updateMemory(m,true,today);expect(m.fsrs).toEqual(good);
  updateMemory(m,false,today);expect(m.due).toBe('2026-11-08');const failed=structuredClone(m.fsrs);
  updateMemory(m,true,today);updateMemory(m,false,today);expect(m.fsrs).toEqual(failed);
 });
 it('updates cumulative results only on the first attempt and keeps pending legacy questions usable',()=>{
  let s=mixed();s.question=makeQuestion(s,'daily',runtime());delete s.question.learningPool;const q=structuredClone(s.question),id=q.wordId,oldWrong=s.mastery[id]?.wrong??0;
  s=answer(s,false);const failed=structuredClone(s.mastery[id]);expect(failed.wrong).toBe(oldWrong+1);s=answer(s,false);s=answer(s,true);expect(s.mastery[id]).toEqual(failed);expect(s.daily.questions).toBe(1);
 });
 it('uses Beijing day boundaries rather than UTC days',()=>{
  const s=initialState([],now),q=makeQuestion(s,'battle',runtime());
  recordFirst(s,q,false,{...runtime(),now:new Date('2026-11-07T15:59:59Z')});expect(s.mastery[q.wordId].due).toBe('2026-11-08');
  recordFirst(s,q,true,{...runtime(),now:new Date('2026-11-07T16:00:01Z')});expect(s.mastery[q.wordId].fsrs?.scheduledOn).toBe('2026-11-08');expect(s.mastery[q.wordId].due>'2026-11-08').toBe(true);
 });
 it('preserves legacy history until a real answer and cold-starts without fabricated reviews',()=>{
  const s=mixed(),id=WORDS[20].id;s.mastery[id]={correct:80,wrong:12,due:today,stage:4,reviewStarted:'2026-10-01'};
  const before=structuredClone(s.mastery[id]);publicState(s,'child',0,now);expect(s.mastery[id]).toEqual(before);
  const q=makeQuestion(s,'review',runtime());q.wordId=id;recordFirst(s,q,true,runtime());expect(s.mastery[id].correct).toBe(81);expect(s.mastery[id].wrong).toBe(12);expect(s.mastery[id].fsrs?.card.reps).toBe(1);
 });
 it('round-trips memory through JSON and rejects corrupt state or references',()=>{
  const s=mixed();s.question=makeQuestion(s,'daily',runtime());recordFirst(s,s.question,true,runtime());
  expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  const bad=structuredClone(s);bad.mastery[s.question.wordId].fsrs!.card.stability=-1;expect(()=>validateSave(bad)).toThrow('Invalid save');
  bad.mastery=structuredClone(s.mastery);bad.recentWordIds=['unknown'];expect(()=>validateSave(bad)).toThrow('word ID');
 });
 it('keeps memory family-local when following another family’s content',()=>{
  const own=mixed(),source=mixed();own.question=makeQuestion(own,'battle',runtime());recordFirst(own,own.question,true,runtime());own.question=null;
  source.mastery={};source.recentWordIds=[];const followed=followContent(own,source);
  expect(followed.mastery).toEqual(own.mastery);expect(followed.recentWordIds).toEqual(own.recentWordIds);
 });
 it('resets the daily allocation on rollover while retaining long-term memory',()=>{
  const s=mixed();s.daily.newWordCount=4;s.daily.questions=10;
  const next=execute(s,{type:'bootstrap',payload:{},operationId:randomUUID()},'child',{...runtime(),now:new Date(dateShift(today,1)+'T04:00:00Z')}).state;
  expect(next.daily.newWordCount??0).toBe(0);expect(next.mastery).toEqual(s.mastery);
 });
});
