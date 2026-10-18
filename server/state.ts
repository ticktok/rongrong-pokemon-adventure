import type { GameState, Daily, Npc, Partner, Role, PublicState } from '../src/game/types';
import { defaultMoves, levelFor, expFor, species, wordsFor, wordBank } from './game-data';
export interface Runtime { now:Date; random:()=>number; uuid:()=>string }
export const dayOf=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const dateShift=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const isWeekend=(day:string)=>[0,6].includes(new Date(day+'T00:00:00Z').getUTCDay());
export function newDaily(date:string):Daily { return {date,questions:0,correct:0,completedIds:[],encounters:0,expGranted:0,practiceFinished:false}; }
export function initialState(npcs:Npc[],now:Date,nickname='融融',realName=''):GameState {
  return {schemaVersion:1,nickname,realName,started:false,partners:[],team:[],seen:[],caught:[],badges:[],position:{regionId:'home-meadow',x:12,y:16},battle:null,question:null,daily:newDaily(dayOf(now)),checkins:[],mastery:{},carry:0,carryTargets:[],npcs,customWords:[],disabledWordIds:[],npcCompleted:[],events:[],
    settings:{baseExp:230,dailyCap:320,captureLimit:3,attackBonus:1.25,comboBonus:1.5,catchBonus:0.15,fastMultiplier:1.2,fastDeadline:'21:30',streakBonus:50,englishPerQuestion:0.02,sealDays:7,maxWordLevel:2,weekdayPassDate:'',tasks:[{id:'chinese',name:'语文作业',active:true},{id:'math',name:'数学作业',active:true},{id:'english',name:'英语练习',active:true},{id:'reading',name:'阅读 15 分钟',active:true}]}};
}
export function addEvent(s:GameState,rt:Runtime,message:string) { s.events.unshift({date:rt.now.toISOString(),message});s.events=s.events.slice(0,80); }
export function makePartner(id:number,level:number,rt:Runtime):Partner { return {id:rt.uuid(),speciesId:id,level,exp:expFor(level),moves:defaultMoves(id,level),acquiredAt:dayOf(rt.now)}; }
export function distribute(s:GameState,amount:number,targetIds:string[]=s.team):number {
  const team=s.partners.filter(p=>targetIds.includes(p.id)&&!p.sealed);
  if(!team.length)return 0;
  for(let i=0;i<team.length;i++){
    const p=team[i],share=Math.floor(amount/team.length)+(i<amount%team.length?1:0),old=p.level;
    p.exp=Math.min(expFor(50),p.exp+share);p.level=levelFor(p.exp);
    if(p.level>old) p.moves=[...new Set([...p.moves,...defaultMoves(p.speciesId,p.level)])].slice(0,4);
  }
  return amount;
}
export function grant(s:GameState,amount:number,targets=s.team):number {
  const available=Math.max(0,s.settings.dailyCap-s.daily.expGranted),allocated=Math.min(available,amount);
  const actual=distribute(s,allocated,targets);
  s.daily.expGranted+=actual;
  const overflow=amount-actual;
  if(overflow){
    const eligible=targets.filter(id=>s.partners.some(p=>p.id===id&&!p.sealed));
    if(!eligible.length)throw new Error('没有可以接收经验的伙伴');
    s.carryByPartner??={};
    eligible.forEach((id,i)=>{s.carryByPartner![id]=(s.carryByPartner![id]??0)+Math.floor(overflow/eligible.length)+(i<overflow%eligible.length?1:0);});
  }
  s.carry=Object.values(s.carryByPartner??{}).reduce((a,b)=>a+b,0);s.carryTargets=Object.keys(s.carryByPartner??{});
  return actual;
}
export function rollover(s:GameState,rt:Runtime){
  const day=dayOf(rt.now);
  if(s.daily.date===day)return;
  s.daily=newDaily(day);
  // Keep an unfinished correction across midnight, without awarding yesterday's daily bonus today.
  if(s.question?.kind==='daily')s.question.kind='review';
  const carry=s.carry,targets=s.carryTargets.length?s.carryTargets:s.team,pending=s.carryByPartner;
  s.carry=0;s.carryTargets=[];s.carryByPartner={};
  if(pending&&Object.keys(pending).length){for(const [id,amount] of Object.entries(pending))grant(s,amount,[id]);}
  else if(carry)grant(s,carry,targets);
}
export function canBattle(s:GameState,day:string){return isWeekend(day)||s.settings.weekdayPassDate===day;}
export function publicState(s:GameState,role:Role,revision:number,now:Date):PublicState {
  const {question,customWords:_,disabledWordIds:__,realName,...rest}=structuredClone(s);
  let publicQuestion:PublicState['question']=null;
  if(question){
    const {correctOptionId:___,wordId:____,explanation,word,example,...safe}=question;
    publicQuestion={...safe,...(question.wrong?{explanation,word,example}:{})};
  }
  return {...rest,question:publicQuestion,role,revision,today:dayOf(now),canBattle:canBattle(s,dayOf(now)),reviewWords:wordBank(s).filter(w=>s.mastery[w.id]).map(({id,word,meaning})=>({id,word,meaning})),wordCount:wordsFor(s).length,...(role==='parent'?{realName,words:wordBank(s).map(w=>({...w,active:!s.disabledWordIds.includes(w.id)}))}:{})};
}
export function streak(s:GameState,day:string):number {
  let n=0;while(s.checkins.some(c=>c.date===dateShift(day,-n)&&c.status==='approved'))n++;return n;
}
export function updateSeals(s:GameState,day:string,rt:Runtime){
  for(const p of s.partners.filter(p=>(p.sealed??0)>0)){
    let n=0;while(dateShift(day,-n)>=p.acquiredAt&&s.checkins.some(c=>c.date===dateShift(day,-n)&&c.status==='approved'))n++;
    p.sealed=Math.max(0,s.settings.sealDays-n);
    if(p.sealed===0)addEvent(s,rt,species(p.speciesId).name+'被你的坚持唤醒了！');
  }
}
