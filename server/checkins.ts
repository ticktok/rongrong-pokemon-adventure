import type {Checkin,CheckinReview,GameState} from '../src/game/types';
import {checkinTasks} from '../src/game/checkins';
import {dayOf,isWeekend,grant,streakMilestones,updateSeals,claimableExp,type Runtime} from './state';

export function reviewRules(s:GameState){
  const {baseExp,fastMultiplier,fastDeadline,englishPerQuestion,streakBonus}=s.settings;
  return {baseExp,fastMultiplier,fastDeadline,englishPerQuestion,streakBonus};
}
export function ensureReview(s:GameState,c:Checkin):CheckinReview{
  // Legacy pending submissions retain their whole-day entitlement over the submitted items.
  return c.review??=( {tasks:checkinTasks(c,s.settings),rules:reviewRules(s),submissionVersion:0,settled:0,streakReward:0} );
}
export function updateCheckinStatus(c:Checkin){
  const tasks=c.review!.tasks;
  c.status=tasks.some(t=>t.status==='pending')?'pending':tasks.every(t=>t.status==='approved')?'approved':tasks.some(t=>t.status==='approved')?'partial':'rejected';
}
export function checkinEntitlement(c:Checkin):number{
  const r=c.review!;const approved=r.tasks.filter(t=>t.status==='approved'),n=r.tasks.length;
  const fast=isWeekend(c.date)?0:approved.filter(t=>{
    if(!t.submittedAt||dayOf(new Date(t.submittedAt))!==c.date)return false;
    const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t.submittedAt));
    return time<=r.rules.fastDeadline;
  }).length;
  return Math.round(r.rules.baseExp*approved.length/n)+Math.round(r.rules.baseExp*(r.rules.fastMultiplier-1)*fast/n)+Math.round(r.rules.baseExp*r.rules.englishPerQuestion*c.englishCorrect*approved.length/n);
}
export function settlementMessage(total:number,actual:number,unallocated:number){
  const deferred=total-actual-unallocated;
  return `本次奖励 ${total} 经验：到账 ${actual}`+(deferred?`，${deferred} 按每日上限顺延`:'')+(unallocated?`，${unallocated} 待分配，可在伙伴页领取`:'')+'。';
}
export function settleCheckin(s:GameState,c:Checkin,rt:Runtime,includeStreak=false){
  const review=c.review!,total=checkinEntitlement(c),delta=Math.max(0,total-review.settled);
  const milestones=streakMilestones(s),streakCount=includeStreak?Math.max(0,milestones-(s.streakRewardsSettled??milestones)):0;
  const bonus=streakCount*review.rules.streakBonus;
  const unallocated=s.unallocatedExp??0;
  const actual=grant(s,delta+bonus);
  review.settled=total;review.streakReward+=bonus;c.granted+=actual;
  if(includeStreak){s.streakRewardsSettled=Math.max(s.streakRewardsSettled??0,milestones);updateSeals(s,dayOf(rt.now),rt);}
  return {total:delta+bonus,actual,message:settlementMessage(delta+bonus,actual,(s.unallocatedExp??0)-unallocated)};
}
export function claimReward(s:GameState){
  if(!s.partners.some(p=>s.team.includes(p.id)&&!p.sealed&&p.level<50))throw new Error('先让一位未满级伙伴加入小队，再领取经验');
  const amount=claimableExp(s);if(!amount)throw new Error('暂时没有待分配经验');
  s.unallocatedExp=0;
  for(const p of s.partners)if(p.level>=50&&s.carryByPartner)delete s.carryByPartner[p.id];
  const actual=grant(s,amount);
  return {message:settlementMessage(amount,actual,s.unallocatedExp??0),effect:'approve' as const};
}
