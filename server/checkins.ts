import type {Checkin,CheckinReview,GameState} from '../src/game/types';
import {species} from './game-data';
import {checkinTasks} from '../src/game/checkins';
import {dayOf,isWeekend,grant,grantShared,cappedHalfExp,streakMilestones,updateSeals,claimableExp,type Runtime} from './state';

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
  const before=s.partners.map(p=>({id:p.id,exp:p.exp,level:p.level}));
  const shared=review.rewardMode==='shared-half';
  const actual=shared?grantShared(s,delta+bonus):grant(s,delta+bonus);
  const details=s.partners.map(p=>{const old=before.find(x=>x.id===p.id)!;return p.exp>old.exp?species(p.speciesId).name+' +'+(p.exp-old.exp)+(p.level>old.level?'（Lv.'+old.level+' → '+p.level+'）':''):'';}).filter(Boolean).join('、');
  const message=shared?`本次基础奖励 ${delta+bonus}：${details||'已保留，等待分配'}。`+`基础额度已用 ${s.daily.baseExpUsed??s.daily.expGranted}/${s.settings.dailyCap}；顺延 ${(s.sharedRewards??[]).reduce((n,r)=>n+r.base,0)} 基础经验，待分配 ${s.sharedUnallocated??0} 基础经验。`:settlementMessage(delta+bonus,actual,(s.unallocatedExp??0)-unallocated);
  review.settled=total;review.streakReward+=bonus;c.granted+=actual;
  if(includeStreak){s.streakRewardsSettled=Math.max(s.streakRewardsSettled??0,milestones);updateSeals(s,dayOf(rt.now),rt);}
  return {total:delta+bonus,actual,message};
}
export function claimReward(s:GameState){
  if(!s.partners.some(p=>s.team.includes(p.id)&&!p.sealed&&p.level<50))throw new Error('先让一位未满级伙伴加入小队，再领取经验');
  let amount=claimableExp(s);const base=s.sharedUnallocated??0;if(!amount&&!base)throw new Error('暂时没有待分配经验');
  const halves=cappedHalfExp(s);amount-=halves/2;
  if(halves){
    const recipient=s.team.find(id=>s.partners.some(p=>p.id===id&&!p.sealed&&p.level<50))!;
    s.expHalfRemainders??={};const combined=halves+(s.expHalfRemainders[recipient]??0);
    for(const partner of s.partners)if(partner.level>=50)delete s.expHalfRemainders[partner.id];
    amount+=Math.floor(combined/2);s.expHalfRemainders[recipient]=combined%2;
  }
  s.unallocatedExp=0;
  for(const p of s.partners)if(p.level>=50&&s.carryByPartner)delete s.carryByPartner[p.id];
  const actual=grant(s,amount);s.sharedUnallocated=0;const sharedActual=base?grantShared(s,base):0;
  return {message:settlementMessage(amount,actual,s.unallocatedExp??0)+(halves?'已保留并转移满级伙伴的半点余数。':'')+(base?'另领取 '+base+' 基础经验，全队实际到账 '+sharedActual+'，剩余按原伙伴顺延。':''),effect:'approve' as const};
}
