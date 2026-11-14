import {useEffect,useRef,useState} from 'react';
import type {BattleEvent,BattleFrame,BattlePlayback} from '../game/types';
import {playMoveEffect} from '../audio';
import {MOVES} from '../../content/world';
export type Playback=BattlePlayback&{id:string};
interface Step {id:string;index:number;frame:BattleFrame;event:BattleEvent;impact:boolean}
export function useBattlePlayback(playback:Playback|null,reduced:boolean,sound:boolean,onDone:()=>void){
 const [step,setStep]=useState<Step|null>(null),done=useRef(onDone),soundEnabled=useRef(sound);done.current=onDone;soundEnabled.current=sound;
 useEffect(()=>{
  if(!playback?.events.length){setStep(null);return;}
  const timers:ReturnType<typeof setTimeout>[]=[];let alive=true,offset=0;
  const schedule=(fn:()=>void,ms:number)=>timers.push(setTimeout(()=>{if(alive)fn();},ms));
  playback.events.forEach((event,index)=>{
   const duration=reduced?220:event.kind==='attack'?1080:event.kind==='capture'?850:event.kind==='sendout'?480:360;
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
 return step?.id===playback.id?step:{id:playback.id,index:0,event:playback.events[0],frame:playback.events[0].before,impact:false};
}
