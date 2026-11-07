import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import additions from '../content/word-expansions.json';
import {WORDS,questionDecoys,questionWords,wordBank,wordsFor} from '../server/game-data';
import {initialState} from '../server/state';
import {makeQuestion,recordFirst} from '../server/quiz';
import {validateSave} from '../server/save-validation';

const now=new Date('2026-11-07T04:00:00Z');
describe('expanded learning vocabulary',()=>{
 it('makes every new word available at level one with complete child-facing content',()=>{
  const state=initialState([],now);state.settings.maxWordLevel=1;
  const eligible=new Set(questionWords(state).map(w=>w.id));
  expect(additions).toHaveLength(156);
  for(const w of additions){
   expect(eligible.has(w.id),w.word).toBe(true);
   expect(w.meaning).toMatch(/[\u3400-\u9fff]/);expect(w.example.toLowerCase()).toContain(w.word);
  }
  expect(WORDS.filter(w=>['scissor','drawn','singing','balloons','shoe','sock','noodle'].includes(w.word))).toEqual([]);
  expect(WORDS.some(w=>w.word==='scissors')).toBe(true);
 });
 it('asks and records every new word in both translation directions',()=>{
  for(const w of additions)for(const random of [()=>0.3,()=>0.8]){
   const state=initialState([],now),rt={now,uuid:randomUUID,random};
   state.mastery[w.id]={correct:0,wrong:1,stage:0,due:'2026-11-07',reviewStarted:'2026-11-07'};
   const q=makeQuestion(state,'review',rt);
   expect(q.wordId).toBe(w.id);expect(q.options).toHaveLength(4);
   expect(new Set(q.options.map(o=>o.text)).size).toBe(4);
   recordFirst(state,q,true,rt);expect(state.mastery[w.id].due).toBe('2026-11-08');
   expect(validateSave(state).mastery[w.id]).toEqual(state.mastery[w.id]);
  }
 });
 it('excludes synonyms and ambiguous adult/baby translations in both directions',()=>{
  for(const [a,b] of [['plane','airplane'],['present','gift'],['pants','trousers'],['cat','kitten'],['chicken','chick'],['pig','piglet'],['duck','duckling'],['sheep','lamb'],['cow','bull'],['animal','koala'],['insect','bee']]){
   for(const reverse of [false,true])for(const [from,to] of [[a,b],[b,a]]){
    const word=WORDS.find(w=>w.word===from)!;
    expect(questionDecoys(word,WORDS,reverse).some(w=>w.word===to),from+' / '+to).toBe(false);
   }
  }
  expect(questionDecoys(WORDS.find(w=>w.word==='cat')!,WORDS,false).some(w=>w.word==='dog')).toBe(true);
 });
 it('preserves custom overrides, paused words and existing mastery when content expands',()=>{
  const state=initialState([],now),old=WORDS.find(w=>w.word==='cat')!,fresh=additions.find(w=>w.word==='plum')!;
  state.customWords=[{...fresh,id:'family-plum',meaning:'家庭自定义李子'}];
  state.disabledWordIds=[old.id];state.mastery[old.id]={correct:3,wrong:1,due:'2026-11-08',stage:2};
  const before=structuredClone(state);
  expect(wordBank(state).filter(w=>w.word==='plum')).toEqual(state.customWords);
  expect(wordsFor(state).some(w=>w.id===old.id)).toBe(false);
  expect(state).toEqual(before);
 });
});
