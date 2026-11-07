import type { GameState, Question, Word } from '../src/game/types';
import type { Runtime } from './state';
import { dayOf } from './state';
import {selectLearningWord,updateMemory} from './learning-scheduler';
import { questionWords,questionDecoys,wordsFor } from './game-data';
export function shuffled<T>(items:T[],rt:Runtime):T[]{ const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(rt.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function makeQuestion(s:GameState,kind:Question['kind'],rt:Runtime,extra:Partial<Question>={}):Question {
  const {word,pool}=selectLearningWord(s,questionWords(s),kind,rt);
  const reverse=rt.random()<0.4;
  const value=(w:Word)=>reverse?w.word:w.meaning;
  const distinct=shuffled(questionDecoys(word,wordsFor(s),reverse),rt).slice(0,3);
  if(distinct.length<3)throw new Error('至少需要四组不同词义的单词才能练习');
  const choices=shuffled([word,...distinct],rt).map(w=>({id:rt.uuid(),text:value(w),correct:w.id===word.id}));
  s.recentWordIds=[...(s.recentWordIds??[]),word.id].slice(-3);
  return {id:rt.uuid(),learningPool:pool,wordId:word.id,prompt:reverse?'“'+word.meaning+'”用英语怎么说？':'“'+word.word+'”是什么意思？',options:choices.map(({id,text})=>({id,text})),correctOptionId:choices.find(c=>c.correct)!.id,wrong:false,kind,word:word.word,explanation:word.word+' · '+word.meaning,example:word.example,...extra};
}
export function recordFirst(s:GameState,q:Question,correct:boolean,rt:Runtime){
  const today=dayOf(rt.now),old=s.mastery[q.wordId]??{correct:0,wrong:0,due:today,stage:0,reviewStarted:today};
  old.reviewStarted??=today;
  if(correct)old.correct++;else old.wrong++;
  updateMemory(old,correct,today);
  s.mastery[q.wordId]=old;
}
