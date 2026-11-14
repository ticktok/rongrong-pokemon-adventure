import {REGIONS} from '../content/packs';
import type {GameState,AdventureAccess} from '../src/game/types';
import {dayOf,dateShift,isWeekend} from './state';

export function nextWeekend(day:string){
  const weekday=new Date(day+'T00:00:00Z').getUTCDay();
  return dateShift(day,weekday===0?6:13-weekday);
}
export function initializeGymProgress(s:GameState,day:string){
  if(s.gymProgress)return;
  const firstWins:Record<string,string>={};
  for(const r of REGIONS.filter(r=>s.badges.includes(r.id))){
    const dates=s.events.filter(e=>e.message.startsWith('获得'+r.badge+'！')).map(e=>new Date(e.date)).filter(d=>Number.isFinite(d.getTime())).map(dayOf).filter(d=>d<=day).sort();
    if(dates.length)firstWins[r.id]=dates[0];
  }
  s.gymProgress={initializedOn:day,firstWins,legacyOpenRegions:REGIONS.filter(r=>s.badges.length>=r.requiredBadges).map(r=>r.id)};
  if(s.battle?.kind==='gym'&&s.battle.status==='active')s.daily.gymStarts=1;
}
export function gymRemaining(s:GameState,day:string){
  return s.daily.date===day?Math.max(0,1+(s.daily.gymExtraStarts??0)-(s.daily.gymStarts??0)):1;
}
export function adventureAccess(s:GameState,day:string):Record<string,AdventureAccess>{
  const progress=s.gymProgress!;
  const remaining=gymRemaining(s,day);
  return Object.fromEntries(REGIONS.map(r=>{
    const previous=REGIONS.find(p=>p.requiredBadges===r.requiredBadges-1);
    const hasBadge=s.badges.includes(r.id),prerequisite=r.requiredBadges===0||!!previous&&s.badges.includes(previous.id);
    const wonOn=previous?(progress.firstWins[previous.id]??progress.initializedOn):undefined;
    const regionOpensOn=wonOn?nextWeekend(wonOn):undefined;
    const regionOpen=hasBadge||progress.legacyOpenRegions.includes(r.id)||(prerequisite&&(!regionOpensOn||day>=regionOpensOn));
    const regionReason=regionOpen?'':!prerequisite?'先获得上一座道馆的徽章吧':regionOpensOn+' 开放';
    const gymEligibleOn=!hasBadge&&wonOn?dateShift(wonOn,7):undefined;
    const gymReason=!regionOpen?regionReason:!prerequisite&&!hasBadge?'先获得上一座道馆的徽章吧':gymEligibleOn&&day<gymEligibleOn?gymEligibleOn+' 可挑战':remaining===0?'今天的道馆挑战已用完':!isWeekend(day)&&s.settings.weekdayPassDate!==day?'道馆挑战周末开放，也可以请家长临时放行':'';
    return [r.id,{regionOpen,regionOpensOn,regionReason,gymAvailable:!gymReason,gymEligibleOn,gymReason}];
  }));
}
