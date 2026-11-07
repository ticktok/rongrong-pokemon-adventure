import {createEmptyCard,fsrs,Rating,type Card} from 'ts-fsrs';
import type {GameState,Mastery,Question,Word} from '../src/game/types';
import {dayOf,dateShift,type Runtime} from './state';

// FSRS models memory; pool allocation and anti-repeat rules belong to the game.
const scheduler=fsrs({request_retention:0.9,maximum_interval:365,enable_fuzz:false,enable_short_term:false});
const midnight=(day:string)=>new Date(day+'T00:00:00+08:00');
const daysBetween=(from:string,to:string)=>Math.max(0,Math.floor((midnight(to).getTime()-midnight(from).getTime())/86400000));
export const learned=(m:Mastery|undefined)=>!!m&&(m.correct+m.wrong>0||!!m.fsrs);
function toCard(m:NonNullable<Mastery['fsrs']>):Card{
  return {...m.card,due:new Date(m.card.due),last_review:m.card.last_review?new Date(m.card.last_review):undefined};
}
export function retrievability(m:Mastery,today:string):number|undefined{
  if(!m.fsrs)return undefined;
  return Math.max(0,Math.min(1,scheduler.get_retrievability(toCard(m.fsrs),midnight(today),false)));
}
export function selectionWeight(m:Mastery|undefined,today:string,pool:Question['learningPool']):number{
  if(!m||pool==='new')return 1;
  const probability=retrievability(m,today);
  if(pool==='due')return (probability===undefined?1:Math.max(0.01,1-probability))*(1+Math.min(daysBetween(m.due,today),30));
  const weakness=probability===undefined?1/(1+m.correct):Math.max(0.01,1-probability);
  const age=m.lastAnsweredOn?daysBetween(m.lastAnsweredOn,today):30;
  return weakness*(1+Math.min(age,30));
}
function weightedChoice(words:Word[],weight:(w:Word)=>number,random:()=>number):Word{
  const weights=words.map(weight),total=weights.reduce((a,b)=>a+b,0);
  let cursor=random()*total;
  for(let i=0;i<words.length;i++){cursor-=weights[i];if(cursor<0)return words[i];}
  return words[words.length-1];
}
export function selectLearningWord(s:GameState,words:Word[],kind:Question['kind'],rt:Runtime):{word:Word;pool:NonNullable<Question['learningPool']>}{
  const today=dayOf(rt.now);
  let available=kind==='daily'?words.filter(w=>!s.daily.completedIds.includes(w.id)):words;
  const isDue=(w:Word)=>learned(s.mastery[w.id])&&s.mastery[w.id].due<=today;
  if(kind==='review')available=available.filter(isDue);
  if(!available.length)throw new Error(kind==='review'?'今天要复习的单词已经完成了':'可用单词不足，请家长补充词库');
  const urgent=available.filter(w=>!learned(s.mastery[w.id])||isDue(w));
  // Never let the anti-repeat filter promote a not-yet-due familiar word.
  let candidates=urgent.length?urgent:available;
  const recent=new Set(s.recentWordIds??[]),fresh=candidates.filter(w=>!recent.has(w.id));
  if(fresh.length)candidates=fresh;
  const newWords=candidates.filter(w=>!learned(s.mastery[w.id])),due=candidates.filter(isDue);
  let pool:NonNullable<Question['learningPool']>,chosen:Word[];
  if(newWords.length&&due.length){
    const wantNew=kind==='daily'?(s.daily.newWordCount??0)<Math.round((s.daily.questions+1)*0.4):rt.random()<0.4;
    pool=wantNew?'new':'due';chosen=wantNew?newWords:due;
  }else if(newWords.length){pool='new';chosen=newWords;}
  else if(due.length){pool='due';chosen=due;}
  else {pool='familiar';chosen=candidates;}
  return {word:weightedChoice(chosen,w=>selectionWeight(s.mastery[w.id],today,pool),rt.random),pool};
}
export function updateMemory(m:Mastery,correct:boolean,today:string){
  m.lastAnsweredOn=today;
  const previous=m.fsrs;
  // One successful scheduling update per day; a later failure may override it.
  if(previous?.scheduledOn===today&&(correct||previous.lastRating==='again'))return;
  const now=midnight(today),card=previous?toCard(previous):createEmptyCard(now);
  const next=scheduler.next(card,now,correct?Rating.Good:Rating.Again).card;
  // Enforce the final cap after FSRS's monotonic-interval adjustment as well.
  const interval=correct?Math.max(1,Math.min(365,next.scheduled_days)):1;
  m.due=dateShift(today,interval);next.due=midnight(m.due);next.scheduled_days=interval;
  m.fsrs={algorithm:'fsrs-6',card:{...next,due:next.due.toISOString(),last_review:next.last_review?.toISOString()},scheduledOn:today,lastRating:correct?'good':'again'};
}
