import type { GameState, Daily, Npc, Partner, Role, PublicState } from '../src/game/types';
import { defaultMoves, levelFor, expFor, species, wordsFor, wordBank,questionWords,dailyGoal } from './game-data';
import {learned} from './learning-scheduler';
import {adventureAccess,initializeGymProgress} from './gym-progress';
import {initializeBoxes} from './partner-storage';
import {qualifies} from '../src/game/checkins';
export interface Runtime { now:Date; random:()=>number; uuid:()=>string }
export const dayOf=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const dateShift=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const isWeekend=(day:string)=>[0,6].includes(new Date(day+'T00:00:00Z').getUTCDay());
export function newDaily(date:string):Daily { return {date,questions:0,correct:0,completedIds:[],encounters:0,expGranted:0,practiceFinished:false,gymStarts:0}; }
export function initialState(npcs:Npc[],now:Date,nickname='融融',realName=''):GameState {
  return {gymProgress:{initializedOn:dayOf(now),firstWins:{},legacyOpenRegions:[]},schemaVersion:1,nickname,realName,started:false,partners:[],team:[],seen:[],caught:[],badges:[],position:{regionId:'home-meadow',x:12,y:16},battle:null,question:null,daily:newDaily(dayOf(now)),checkins:[],mastery:{},carry:0,carryTargets:[],npcs,customWords:[],disabledWordIds:[],npcCompleted:[],events:[],
    settings:{baseExp:230,dailyCap:320,captureLimit:3,attackBonus:1.25,comboBonus:1.5,catchBonus:0.15,fastMultiplier:1.2,fastDeadline:'21:30',streakBonus:50,englishPerQuestion:0.02,sealDays:7,maxWordLevel:2,weekdayPassDate:'',tasks:[{id:'chinese',name:'语文作业',active:true},{id:'math',name:'数学作业',active:true},{id:'english',name:'英语练习',active:true},{id:'reading',name:'阅读 15 分钟',active:true}]}};
}
export function addEvent(s:GameState,rt:Runtime,message:string) { s.events.unshift({date:rt.now.toISOString(),message});s.events=s.events.slice(0,80); }
export function makePartner(id:number,level:number,rt:Runtime):Partner { return {id:rt.uuid(),speciesId:id,level,exp:expFor(level),moves:defaultMoves(id,level),acquiredAt:dayOf(rt.now)}; }
export function distribute(s:GameState,amount:number,targetIds:string[]=s.team):number {
  let remaining=amount;
  let team=s.partners.filter(p=>targetIds.includes(p.id)&&!p.sealed&&p.exp<expFor(50));
  while(remaining>0&&team.length){
    const budget=remaining;
    for(let i=0;i<team.length;i++){
      const p=team[i],share=Math.min(expFor(50)-p.exp,Math.floor(budget/team.length)+(i<budget%team.length?1:0)),old=p.level;
      p.exp+=share;remaining-=share;p.level=levelFor(p.exp);
      if(p.level>old)p.moves=[...new Set([...p.moves,...defaultMoves(p.speciesId,p.level)])].slice(0,4);
    }
    team=team.filter(p=>p.exp<expFor(50));
  }
  return amount-remaining;
}
export function refreshCarry(s:GameState){
  s.carry=Object.values(s.carryByPartner??{}).reduce((a,b)=>a+b,0);s.carryTargets=Object.keys(s.carryByPartner??{});
}
export function cappedHalfExp(s:GameState){return Object.entries(s.expHalfRemainders??{}).reduce((n,[id,half])=>n+(s.partners.some(p=>p.id===id&&p.level>=50)?half:0),0);}
export function claimableExp(s:GameState){
  return cappedHalfExp(s)/2+(s.unallocatedExp??0)+Object.entries(s.carryByPartner??{}).reduce((n,[id,amount])=>n+(s.partners.some(p=>p.id===id&&p.level>=50)?amount:0),0);
}
export function grant(s:GameState,amount:number,targets=s.team,preserveTargets=false):number {
  if(!Number.isSafeInteger(amount)||amount<0)throw new Error('奖励数值无效');
  s.daily.baseExpUsed??=s.daily.expGranted;
  const available=Math.max(0,s.settings.dailyCap-s.daily.baseExpUsed),allocated=Math.min(available,amount);
  const actual=distribute(s,allocated,targets);
  s.daily.expGranted+=actual;s.daily.baseExpUsed+=actual;
  const overflow=amount-actual;
  if(overflow){
    const eligible=[...new Set(targets)].filter(id=>s.partners.some(p=>p.id===id&&!p.sealed&&(preserveTargets||p.exp<expFor(50))));
    if(!eligible.length)s.unallocatedExp=(s.unallocatedExp??0)+overflow;
    else{
      s.carryByPartner??={};
      eligible.forEach((id,i)=>{const share=Math.floor(overflow/eligible.length)+(i<overflow%eligible.length?1:0);if(share)s.carryByPartner![id]=(s.carryByPartner![id]??0)+share;});
    }
  }
  refreshCarry(s);
  return actual;
}
/** Shared rewards retain base units and their original recipients until delivered. */
export function settleSharedQueue(s:GameState){
  s.daily.baseExpUsed??=s.daily.expGranted;s.expHalfRemainders??={};
  let actual=0;
  for(const reward of s.sharedRewards??[]){
    const base=Math.min(reward.base,Math.max(0,s.settings.dailyCap-s.daily.baseExpUsed));
    if(!base)break;
    for(const id of reward.partnerIds){
      const halves=base*(reward.rate===1?2:1)+(s.expHalfRemainders[id]??0);
      const earned=Math.floor(halves/2);s.expHalfRemainders[id]=halves%2;
      const given=distribute(s,earned,[id]);actual+=given;
      // Already converted experience must never be shared a second time.
      if(earned>given)s.unallocatedExp=(s.unallocatedExp??0)+earned-given;
    }
    reward.base-=base;s.daily.baseExpUsed+=base;
  }
  s.sharedRewards=s.sharedRewards?.filter(r=>r.base>0);
  s.daily.expGranted+=actual;return actual;
}
export function grantShared(s:GameState,amount:number){
  if(!Number.isSafeInteger(amount)||amount<0)throw new Error('奖励数值无效');
  const targets=s.team.filter(id=>s.partners.some(p=>p.id===id&&!p.sealed&&p.level<50));
  if(!targets.length){s.sharedUnallocated=(s.sharedUnallocated??0)+amount;return 0;}
  s.sharedRewards??=[];
  if(amount)s.sharedRewards.push({base:amount,partnerIds:targets,rate:s.team.length===1?1:0.5});
  return settleSharedQueue(s);
}
export function rollover(s:GameState,rt:Runtime){
  const day=dayOf(rt.now);
  if(s.daily.date===day)return;
  s.daily=newDaily(day);
  // Keep an unfinished correction across midnight, without awarding yesterday's daily bonus today.
  if(s.question?.kind==='daily')s.question.kind='review';
  const carry=s.carry,targets=s.carryTargets.length?s.carryTargets:s.team,pending=s.carryByPartner;
  s.carry=0;s.carryTargets=[];s.carryByPartner={};
  if(pending&&Object.keys(pending).length){for(const [id,amount] of Object.entries(pending))grant(s,amount,[id],true);}
  else if(carry)grant(s,carry,targets,true);
  settleSharedQueue(s);
}
export function canBattle(s:GameState,day:string){return isWeekend(day)||s.settings.weekdayPassDate===day;}
export function publicState(s:GameState,role:Role,revision:number,now:Date):PublicState {
  s=structuredClone(s);initializeBoxes(s);initializeGymProgress(s,dayOf(now));
  const {question,customWords:_,disabledWordIds:__,recentWordIds:___recent,realName,...rest}=structuredClone(s);
  let publicQuestion:PublicState['question']=null;
  if(question){
    const {correctOptionId:___,wordId:____,learningPool:_____,explanation,word,example,...safe}=question;
    publicQuestion={...safe,...(question.wrong?{explanation,word,example}:{})};
  }
  const availableWords=questionWords(s),reviewWords=availableWords.filter(w=>learned(s.mastery[w.id])),availableIds=new Set(availableWords.map(w=>w.id)),goal=dailyGoal(s,availableWords);
  return {...rest,adventureAccess:adventureAccess(s,dayOf(now)),gymRemaining:Math.max(0,1-(s.daily.date===dayOf(now)?s.daily.gymStarts??0:0)),daily:{...rest.daily,goal,practiceFinished:goal>0&&s.daily.questions>=goal},question:publicQuestion,role,revision,today:dayOf(now),canBattle:canBattle(s,dayOf(now)),reviewWords:wordBank(s).filter(w=>s.mastery[w.id]).map(({id,word,meaning})=>({id,word,meaning,reviewable:availableIds.has(id)})),reviewCount:reviewWords.filter(w=>s.mastery[w.id].due<=dayOf(now)).length,claimableExp:claimableExp(s),wordCount:wordsFor(s).length,...(role==='parent'?{realName,words:wordBank(s).map(w=>({...w,active:!s.disabledWordIds.includes(w.id)}))}:{})};
}
export function qualifyingDates(s:GameState){return [...new Set(s.checkins.filter(qualifies).map(c=>c.date))].sort();}
export function streak(s:GameState,day:string):number {
  const dates=new Set(qualifyingDates(s));let n=0;while(dates.has(dateShift(day,-n)))n++;return n;
}
export function streakMilestones(s:GameState){
  let previous='',length=0,total=0;
  for(const day of qualifyingDates(s)){length=previous&&dateShift(previous,1)===day?length+1:1;if(length%7===0)total++;previous=day;}
  return total;
}
export function initializeRewardProgress(s:GameState){
  // Historical rewards are already settled. Initialize before accepting any new approval.
  s.streakRewardsSettled??=streakMilestones(s);
  const dates=qualifyingDates(s);
  for(const p of s.partners)if(p.sealed&&p.sealCountedDates===undefined)p.sealCountedDates=dates.filter(d=>d>=p.acquiredAt);
  if(s.carry&&!Object.keys(s.carryByPartner??{}).length){
    const targets=[...new Set(s.carryTargets.length?s.carryTargets:s.team)];
    if(targets.length){s.carryByPartner=Object.fromEntries(targets.map((id,i)=>[id,Math.floor(s.carry/targets.length)+(i<s.carry%targets.length?1:0)]));refreshCarry(s);}
    else{s.unallocatedExp=(s.unallocatedExp??0)+s.carry;s.carry=0;s.carryTargets=[];}
  }
}
export function updateSeals(s:GameState,day:string,rt:Runtime){
  const dates=qualifyingDates(s).filter(d=>d<=day);
  for(const p of s.partners.filter(p=>(p.sealed??0)>0)){
    const counted=new Set(p.sealCountedDates??[]),added=dates.filter(d=>d>=p.acquiredAt&&!counted.has(d));
    p.sealed=Math.max(0,p.sealed!-added.length);p.sealCountedDates=[...counted,...added].sort();
    if(p.sealed===0)addEvent(s,rt,species(p.speciesId).name+'被你的坚持唤醒了！');
  }
}
