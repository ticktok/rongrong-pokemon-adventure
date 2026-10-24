import type { GameState, Question, Word } from '../src/game/types';
import type { Runtime } from './state';
import { dayOf,dateShift } from './state';
import { questionWords,questionDecoys,wordsFor } from './game-data';
export function shuffled<T>(items:T[],rt:Runtime):T[]{ const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(rt.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function makeQuestion(s:GameState,kind:Question['kind'],rt:Runtime,extra:Partial<Question>={}):Question {
  const words=questionWords(s),today=dayOf(rt.now);
  let pool=words;
  if(kind==='daily')pool=words.filter(w=>!s.daily.completedIds.includes(w.id));
  if(kind==='review')pool=words.filter(w=>s.mastery[w.id]?.due<=today);
  if(!pool.length)throw new Error(kind==='review'?'今天要复习的单词已经完成了':'可用单词不足，请家长补充词库');
  const due=pool.filter(w=>s.mastery[w.id]?.due<=today);
  const word=shuffled(due.length&&rt.random()<0.6?due:pool,rt)[0];
  const reverse=rt.random()<0.4;
  const value=(w:Word)=>reverse?w.word:w.meaning;
  const distinct=shuffled(questionDecoys(word,wordsFor(s),reverse),rt).slice(0,3);
  if(distinct.length<3)throw new Error('至少需要四组不同词义的单词才能练习');
  const choices=shuffled([word,...distinct],rt).map(w=>({id:rt.uuid(),text:value(w),correct:w.id===word.id}));
  return {id:rt.uuid(),wordId:word.id,prompt:reverse?'“'+word.meaning+'”用英语怎么说？':'“'+word.word+'”是什么意思？',options:choices.map(({id,text})=>({id,text})),correctOptionId:choices.find(c=>c.correct)!.id,wrong:false,kind,word:word.word,explanation:word.word+' · '+word.meaning,example:word.example,...extra};
}
export function recordFirst(s:GameState,q:Question,correct:boolean,rt:Runtime){
  const today=dayOf(rt.now),old=s.mastery[q.wordId]??{correct:0,wrong:0,due:today,stage:0,reviewStarted:today};
  old.reviewStarted??=today;
  if(correct){
    old.correct++;
    if(old.due<=today){
      const days=[1,3,7],next=days.findIndex(n=>dateShift(old.reviewStarted!,n)>today);
      old.stage=next<0?4:next+1;old.due=next<0?dateShift(today,7):dateShift(old.reviewStarted,days[next]);
    }
  }else {old.wrong++;old.stage=0;old.due=today;old.reviewStarted=today;}
  s.mastery[q.wordId]=old;
}
