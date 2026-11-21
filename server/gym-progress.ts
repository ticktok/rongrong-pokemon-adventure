import {REGIONS} from '../content/packs';
import type {GameState,AdventureAccess} from '../src/game/types';
import {dayOf,dateShift,canBattle} from './state';

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
export function adventureQuota(s:GameState,day:string,kind:'wild'|'gym'){
  const gym=kind==='gym';
  const base=gym?s.settings.gymLimit??1:s.settings.captureLimit;
  const today=s.daily.date===day;
  const used=today?(gym?s.daily.gymStarts??0:s.daily.encounters):0;
  const extra=today?(gym?s.daily.gymExtraStarts??0:s.daily.extraEncounters??0):0;
  // Older saves used a fixed daily gym allowance of one before spending any retries.
  const spent=today?(gym?s.daily.gymExtrasUsed??Math.min(extra,Math.max(0,used-1)):s.daily.extraEncountersUsed??0):0;
  const baseRemaining=Math.max(0,base-(used-spent));
  return {baseRemaining,spent,remaining:baseRemaining+extra-spent};
}
export function gymRemaining(s:GameState,day:string){return adventureQuota(s,day,'gym').remaining;}
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
    const gymReason=!regionOpen?regionReason:!prerequisite&&!hasBadge?'先获得上一座道馆的徽章吧':gymEligibleOn&&day<gymEligibleOn?gymEligibleOn+' 可挑战':remaining===0?'今天的道馆挑战已用完':!canBattle(s,day)?'今天未开放冒险，可以请家长临时放行':'';
    return [r.id,{regionOpen,regionOpensOn,regionReason,gymAvailable:!gymReason,gymEligibleOn,gymReason}];
  }));
}
