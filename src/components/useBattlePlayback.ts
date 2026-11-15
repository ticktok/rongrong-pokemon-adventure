import {useEffect,useRef,useState} from 'react';
import type {BattleEvent,BattleFrame,BattlePlayback} from '../game/types';
import {playMoveEffect} from '../audio';
import {MOVES} from '../../content/world';
import {captureTimeline,type CapturePhase} from '../game/presentation';
import {playCaptureCue} from '../music';
import {playEffect} from '../audio';
export type Playback=BattlePlayback&{id:string};
interface Step {id:string;index:number;frame:BattleFrame;event:BattleEvent;impact:boolean;phase?:CapturePhase}
export function useBattlePlayback(playback:Playback|null,reduced:boolean,sound:boolean,onDone:()=>void){
 const [step,setStep]=useState<Step|null>(null),done=useRef(onDone),soundEnabled=useRef(sound);done.current=onDone;soundEnabled.current=sound;
 useEffect(()=>{
  if(!playback?.events.length){setStep(null);return;}
  const timers:ReturnType<typeof setTimeout>[]=[];let alive=true,offset=0;
  const schedule=(fn:()=>void,ms:number)=>timers.push(setTimeout(()=>{if(alive)fn();},ms));
  playback.events.forEach((event,index)=>{
   if(event.kind==='capture'){
    const timeline=captureTimeline(event,reduced);
    timeline.phases.forEach(([at,phase])=>schedule(()=>{
      const impact=at>=timeline.reveal;
      setStep({id:playback.id,index,frame:impact?event.after:event.before,event,impact,phase});
      if(phase==='success')playCaptureCue(playback.id,soundEnabled.current);
      if(phase.startsWith('shake'))playEffect('shake',soundEnabled.current);
    },offset+at));
    offset+=timeline.duration;return;
   }
   const duration=reduced?220:event.kind==='attack'?1080:event.kind==='sendout'?480:360;
   schedule(()=>{
    setStep({id:playback.id,index,frame:event.before,event,impact:false});
    if(event.kind==='attack')playMoveEffect(MOVES.find(m=>m.id===event.moveId)?.type??'normal',soundEnabled.current);
   },offset);
   schedule(()=>setStep({id:playback.id,index,frame:event.after,event,impact:true}),offset+(reduced?80:event.kind==='attack'?650:Math.round(duration*.5)));
   offset+=duration;
  });
  schedule(()=>{setStep(null);done.current();},offset);
  // Timers, rather than renderer callbacks, own completion, so a failed canvas cannot lock controls.
  return()=>{alive=false;timers.forEach(clearTimeout);};
 },[playback,reduced]);
 if(!playback?.events.length)return null;
 return step?.id===playback.id?step:{id:playback.id,index:0,event:playback.events[0],frame:playback.events[0].before,impact:false,phase:playback.events[0].kind==='capture'?captureTimeline(playback.events[0],reduced).phases[0][1]:undefined};
}
