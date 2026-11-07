import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {execute} from '../server/engine';
import {initialState,makePartner,publicState,grant,rollover,claimableExp,dateShift,streakMilestones} from '../server/state';
import {expFor,WORDS,questionWords} from '../server/game-data';
import {validateSave} from '../server/save-validation';
import type {GameState,Role} from '../src/game/types';

const rt={now:new Date('2026-10-19T10:00:00Z'),uuid:randomUUID,random:()=>.31};
function act(s:GameState,type:string,payload:Record<string,unknown>={},role:Role='child',now=rt.now){return execute(s,{type,payload,operationId:randomUUID()},role,{...rt,now});}
function start(){
  const s=act(initialState([],rt.now),'starter',{speciesId:25}).state;
  s.settings.tasks=['a','b','c','d','e'].map(id=>({id,name:'任务'+id,active:true}));return s;
}
function submit(s:GameState,taskIds:string[],now=rt.now){return act(s,'checkin.submit',{taskIds},'child',now).state;}
function review(s:GameState,approvedTaskIds:string[],date=s.daily.date,now=rt.now){
  const c=s.checkins.find(c=>c.date===date)!;
  return act(s,'parent.review',{date,approvedTaskIds,submissionVersion:c.review?.submissionVersion??0,reason:'再检查一下'},'parent',now).state;
}
function solve(s:GameState){const q=s.question!;return act(s,'answer',{questionId:q.id,optionId:q.correctOptionId}).state;}
const earned=(s:GameState)=>s.checkins[0].review!.settled;
const totalExp=(s:GameState)=>(s.sharedUnallocated??0)+(s.sharedRewards??[]).reduce((n,r)=>n+r.base*r.rate*r.partnerIds.length,0)+s.partners.reduce((n,p)=>n+p.exp,0)+s.carry+(s.unallocatedExp??0);

describe('itemized approval',()=>{
 it('keeps approved tasks, resubmits only remaining tasks and pays the exact cumulative difference',()=>{
  let s=start();s.settings.fastMultiplier=1;
  s=review(submit(s,['a','b','c','d','e']),['a','b']);
  expect(s.checkins[0].status).toBe('partial');expect(earned(s)).toBe(92);expect(s.daily.expGranted).toBe(92);
  expect(()=>submit(s,['a'])).toThrow('尚未通过');
  s=submit(s,['c','d','e']);expect(s.checkins[0].review!.tasks.filter(t=>t.status==='approved')).toHaveLength(2);
  expect(()=>submit(s,['c'])).toThrow('等待');
  s=review(s,['c','d','e']);expect(s.checkins[0].status).toBe('approved');expect(earned(s)).toBe(230);expect(s.daily.expGranted).toBe(230);
  expect(()=>review(s,[])).toThrow('已处理');expect(()=>submit(s,['a'])).toThrow('全部通过');validateSave(s);
 });
 it('allows unsubmitted tasks after the submitted subset passes, without closing the day early',()=>{
  let s=review(submit(start(),['a']),['a']);expect(s.checkins[0].status).toBe('partial');
  expect(s.checkins[0].review!.tasks.find(t=>t.id==='b')!.status).toBe('unsubmitted');
  s=review(submit(s,['b']),['b']);expect(earned(s)).toBe(110);expect(s.checkins).toHaveLength(1);
 });
 it('rejects a stale review even when the next batch contains the same task IDs',()=>{
  let s=submit(start(),['a']);const version=s.checkins[0].review!.submissionVersion;
  s=submit(review(s,[]),['a']);
  expect(()=>act(s,'parent.review',{date:s.daily.date,approvedTaskIds:['a'],submissionVersion:version},'parent')).toThrow('批次');
  expect(()=>act(s,'parent.review',{date:s.daily.date,approve:true},'parent')).toThrow('刷新');
  expect(()=>review(s,['b'])).toThrow('本批次');
  expect(()=>act(s,'parent.review',{date:s.daily.date,approvedTaskIds:['a'],submissionVersion:2})).toThrow('家长');
 });
 it('permits late reviews but cannot resubmit yesterday by supplying a date',()=>{
  let s=submit(start(),['a','b']);const tomorrow=new Date('2026-10-19T16:00:00Z');
  s=review(s,['a'],'2026-10-19',tomorrow);expect(s.checkins[0].status).toBe('partial');expect(s.daily.date).toBe('2026-10-20');
  expect(()=>act(s,'checkin.submit',{date:'2026-10-19',taskIds:['b']},'child',tomorrow)).toThrow('今天');
  s=submit(s,['b'],tomorrow);expect(s.checkins).toHaveLength(2);expect(s.checkins[0].review!.tasks[1].status).toBe('rejected');
 });
 it('freezes the task denominator, names and reward rules at first submission',()=>{
  let s=submit(start(),['a','b']);s=act(s,'parent.tasks',{tasks:[{id:'new',name:'新任务',active:true}]},'parent').state;
  s=act(s,'parent.settings',{baseExp:1000,fastMultiplier:2,englishPerQuestion:.1},'parent').state;
  s=review(s,['a','b']);expect(earned(s)).toBe(110);expect(s.checkins[0].review!.tasks[0].name).toBe('任务a');
  expect(()=>submit(s,['new'])).toThrow('当天');
  s=review(submit(s,['c','d','e']),['c','d','e']);expect(earned(s)).toBe(276);
 });
 it('uses the resubmission time for fast bonuses and does not depend on the approval time',()=>{
  let s=review(submit(start(),['a','b']),['a']);
  s=submit(s,['b'],new Date('2026-10-19T13:31:00Z'));s=review(s,['b'],'2026-10-19',new Date('2026-10-19T15:00:00Z'));
  expect(earned(s)).toBe(101); // 92 base + only a's 9 quick points
 });
 it('does not mint rounding points through different batch orders',()=>{
  for(const order of [['a','b','c','d','e'],['e','c','a','b','d']]){
    let s=start();s.daily.correct=10;const before=totalExp(s);
    for(const id of order)s=review(submit(s,[id]),[id]);
    expect(earned(s)).toBe(322);expect(s.daily.expGranted).toBe(320);expect(s.sharedRewards?.reduce((n,r)=>n+r.base,0)).toBe(2);expect(totalExp(s)-before).toBe(322);
  }
 });
 it('tops up English after approval, including after all tasks pass, and counts only first answers',()=>{
  let s=start();s.settings.fastMultiplier=1;s=review(submit(s,['a','b','c','d','e']),['a','b','c','d','e']);
  for(let i=0;i<10;i++){
    s=act(s,'practice.start').state;
    if(i===0){const q=s.question!;s=act(s,'answer',{questionId:q.id,optionId:q.options.find(o=>o.id!==q.correctOptionId)!.id}).state;}
    s=solve(s);
  }
  expect(s.daily.correct).toBe(9);expect(earned(s)).toBe(271);expect(s.daily.expGranted).toBe(271);
 });
 it('does not pay English before a parent approves any task',()=>{
  let s=submit(start(),['a']);s=solve(act(s,'practice.start').state);
  expect(earned(s)).toBe(0);expect(s.daily.expGranted).toBe(0);s=review(s,['a']);expect(earned(s)).toBe(56);
 });
 it('keeps legacy closed records untouched and preserves a legacy pending whole-day entitlement',()=>{
  let s=start();delete s.streakRewardsSettled;
  const old={date:s.daily.date,taskIds:['a','b'],status:'approved' as const,submittedAt:rt.now.toISOString(),englishCorrect:0,granted:276};
  s.checkins=[structuredClone(old)];s=solve(act(s,'practice.start').state);expect(s.checkins[0]).toEqual(old);
  s=start();s.checkins=[{...old,status:'pending',granted:0}];s=review(s,['a']);expect(earned(s)).toBe(138);expect(s.checkins[0].review!.tasks).toHaveLength(2);
 });
});

describe('valid days and cumulative encouragement',()=>{
 it('counts a partial day once for seals and gives a seven-day reward only once',()=>{
  let s=start();const gift=makePartner(143,8,rt);gift.sealed=7;gift.sealCountedDates=[];s.partners.push(gift);
  for(let i=0;i<7;i++){
    const now=new Date(dateShift('2026-10-19',i)+'T10:00:00Z');
    s=review(submit(s,['a'],now),['a'],dateShift('2026-10-19',i),now);
    const remaining=s.partners[1].sealed;s=review(submit(s,['b'],now),['b'],s.daily.date,now);expect(s.partners[1].sealed).toBe(remaining);
  }
  expect(s.partners[1].sealed).toBe(0);expect(s.streakRewardsSettled).toBe(1);expect(s.checkins.reduce((n,c)=>n+c.review!.streakReward,0)).toBe(50);
 });
 it('does not reset seals after a gap or after reviewing an earlier record',()=>{
  let s=start();const gift=makePartner(143,8,rt);gift.sealed=3;gift.acquiredAt='2026-10-13';s.partners.push(gift);
  s=submit(s,['a']);
  const later=new Date('2026-10-22T10:00:00Z');s=review(submit(s,['a'],later),['a'],'2026-10-22',later);expect(s.partners[1].sealed).toBe(2);
  s=review(s,['a'],'2026-10-19',later);expect(s.partners[1].sealed).toBe(1);
 });
 it('settles a streak completed by out-of-order review, without replaying older streaks',()=>{
  let s=start();delete s.streakRewardsSettled;
  s.checkins=Array.from({length:14},(_,i)=>({date:dateShift('2026-10-05',i),taskIds:['a'],status:'approved' as const,submittedAt:rt.now.toISOString(),englishCorrect:0,granted:230}));
  s=act(s,'bootstrap').state;expect(s.streakRewardsSettled).toBe(2);
  for(let i=0;i<7;i++){
    const day=dateShift('2026-10-19',i),now=new Date(day+'T10:00:00Z');s=submit(s,['a'],now);if(i!==1)s=review(s,['a'],day,now);
  }
  expect(s.streakRewardsSettled).toBe(2);
  s=review(s,['a'],'2026-10-20',new Date('2026-10-25T10:00:00Z'));expect(streakMilestones(s)).toBe(3);expect(s.streakRewardsSettled).toBe(3);
  expect(s.checkins.find(c=>c.date==='2026-10-20')!.review!.streakReward).toBe(50);
 });
});

describe('experience conservation at the level cap',()=>{
 it('preserves legacy carry without a partner map before a same-day reward',()=>{
  let s=start();s.carry=101;s.carryTargets=[s.partners[0].id];delete s.carryByPartner;
  s=review(submit(s,['a']),['a']);expect(s.carry).toBe(101);expect(s.carryByPartner![s.partners[0].id]).toBe(101);
 });
 it('redistributes capped shares only within the receiving team and counts real additions',()=>{
  const s=start(),full=s.partners[0];full.exp=expFor(50);full.level=50;
  const p=makePartner(4,49,rt);p.exp=expFor(50)-2;s.partners.push(p,makePartner(7,5,rt));s.team=s.partners.map(p=>p.id);
  const before=s.partners.map(p=>p.exp);expect(grant(s,100)).toBe(100);
  expect(s.partners.map((p,i)=>p.exp-before[i])).toEqual([0,2,98]);expect(s.daily.expGranted).toBe(100);
 });
 it('retains all-full-team rewards and explicitly claims them into a growing team',()=>{
  let s=start();s.partners[0].exp=expFor(50);s.partners[0].level=50;
  expect(grant(s,100)).toBe(0);expect(s.daily.expGranted).toBe(0);expect(s.unallocatedExp).toBe(100);
  expect(()=>act(s,'reward.claim')).toThrow('未满级');
  const p=makePartner(4,5,rt);s.partners.push(p);s=act(s,'team.update',{partnerIds:[p.id]}).state;
  s=act(s,'reward.claim').state;expect(s.partners[1].exp).toBe(260);expect(s.unallocatedExp).toBe(0);expect(s.daily.expGranted).toBe(100);
  expect(()=>act(s,'reward.claim')).toThrow('没有');
 });
 it('preserves bound carry when its original partner reaches the cap until explicit claiming',()=>{
  let s=start();s.partners[0].exp=expFor(50)-1;s.partners[0].level=49;s.daily.expGranted=320;
  grant(s,100,[s.partners[0].id]);s.partners.push(makePartner(4,5,rt));s.team=[s.partners[1].id];
  const tomorrow=new Date('2026-10-20T10:00:00Z');rollover(s,{...rt,now:tomorrow});
  expect(s.partners[0].exp).toBe(expFor(50));expect(s.partners[1].exp).toBe(160);expect(s.carry).toBe(99);expect(claimableExp(s)).toBe(99);expect(s.daily.expGranted).toBe(1);
  s=act(s,'reward.claim',{},'child',tomorrow).state;expect(s.partners[1].exp).toBe(259);expect(s.carry).toBe(0);
 });
 it('conserves integer rewards across caps, rollover and partial approvals',()=>{
  for(let capacity=0;capacity<6;capacity++){
    let s=start();s.partners[0].exp=expFor(50)-capacity;s.partners[0].level=capacity?49:50;s.settings.dailyCap=3;
    const before=totalExp(s);s=review(submit(s,['a','b','c']),['a','c']);
    expect(totalExp(s)-before).toBe(110);expect(s.daily.expGranted).toBeLessThanOrEqual(3);
    rollover(s,{...rt,now:new Date('2026-10-20T10:00:00Z')});expect(totalExp(s)-before).toBe(110);validateSave(s);
  }
 });
});

describe('learning availability',()=>{
 it('completes a four-word daily goal instead of becoming stuck at 4/10',()=>{
  let s=start();s.disabledWordIds=WORDS.slice(4).map(w=>w.id);
  for(let i=0;i<4;i++)s=solve(act(s,'practice.start').state);
  expect(s.daily.goal).toBe(4);expect(s.daily.practiceFinished).toBe(true);expect(()=>act(s,'practice.start')).toThrow('已完成');
 });
 it('shrinks an established target but never raises it after adding words that day',()=>{
  let s=start();s.disabledWordIds=WORDS.slice(4).map(w=>w.id);s=solve(act(s,'practice.start').state);expect(s.daily.goal).toBe(4);
  s.disabledWordIds=[];s=act(s,'bootstrap').state;expect(s.daily.goal).toBe(4);
  const ids=new Set([s.daily.completedIds[0],...WORDS.slice(10,14).map(w=>w.id)]);s.disabledWordIds=WORDS.filter(w=>!ids.has(w.id)).map(w=>w.id);
  s=solve(act(s,'practice.start').state);expect(s.daily.questions).toBe(2);expect(s.daily.goal).toBe(4);
 });
 it('keeps a held question completable after the word is disabled and filters review counts',()=>{
  let s=act(start(),'practice.start').state;const word=s.question!.wordId;
  s.mastery[word]={correct:1,wrong:0,stage:1,due:s.daily.date};s.disabledWordIds=[word];
  const view=publicState(s,'child',0,rt.now);expect(view.reviewCount).toBe(0);expect(view.reviewWords.find(w=>w.id===word)?.reviewable).toBe(false);
  s=solve(s);expect(s.daily.questions).toBe(1);expect(s.daily.goal).toBeGreaterThanOrEqual(1);
  expect(questionWords(s).some(w=>w.id===word)).toBe(false);
 });
 it('validates additive review state and rejects inconsistent partial backup records',()=>{
  const s=review(submit(start(),['a','b']),['a']);expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  const broken=structuredClone(s);broken.checkins[0].status='approved';expect(()=>validateSave(broken)).toThrow('checkin status');
 });
});
