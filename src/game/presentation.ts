import type {BattleEvent, Battle} from './types';

export type CapturePhase = 'throw'|'absorb'|'drop'|'shake-1'|'shake-2'|'shake-3'|'success'|'breakout';
export function captureTimeline(event:BattleEvent,reduced:boolean):{duration:number;reveal:number;phases:[number,CapturePhase][]}{
  const caught=event.after.battle.status==='caught';
  if(reduced)return {duration:400,reveal:0,phases:[[0,caught?'success':'breakout']]};
  const phases:[number,CapturePhase][]=[[0,'throw'],[450,'absorb'],[700,'drop'],[1000,'shake-1'],[1600,'shake-2']];
  if(caught)phases.push([2200,'shake-3'],[2800,'success']);else phases.push([2200,'breakout']);
  return {duration:caught?3500:2800,reveal:caught?2800:2200,phases};
}
export const ENCOUNTER_STYLES=['flash','spiral','iris'] as const;
export function encounterStyle(index:number){return ENCOUNTER_STYLES[index%ENCOUNTER_STYLES.length];}
export function captureHidden(battle:Battle,phase?:CapturePhase){
  return phase?['drop','shake-1','shake-2','shake-3','success'].includes(phase):battle.status==='caught';
}
