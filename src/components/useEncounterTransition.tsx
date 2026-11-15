import {useCallback,useEffect,useRef,useState} from 'react';
import type {PublicState} from '../game/types';
import {encounterStyle} from '../game/presentation';
import './Encounter.css';

interface Transition {id:string;world:PublicState;style:ReturnType<typeof encounterStyle>;closed:boolean;settled:boolean;opening:boolean}
export function useEncounterTransition(reduced:boolean){
  const [transition,setTransition]=useState<Transition|null>(null),count=useRef(0),active=useRef(false);
  const cancel=useCallback(()=>{active.current=false;setTransition(null);},[]);
  const begin=useCallback((id:string,world:PublicState)=>{
    active.current=true;
    setTransition({id,world,style:encounterStyle(count.current++),closed:false,settled:false,opening:false});
  },[]);
  const settle=useCallback((id:string)=>setTransition(t=>t?.id===id?{...t,settled:true}:t),[]);
  useEffect(()=>{
    if(!transition)return;
    const id=transition.id;
    if(!transition.closed){const timer=setTimeout(()=>setTransition(t=>t?.id===id?{...t,closed:true}:t),reduced?100:500);return()=>clearTimeout(timer);}
    if(transition.settled&&!transition.opening)setTransition(t=>t?.id===id?{...t,opening:true}:t);
    if(transition.opening){const timer=setTimeout(cancel,reduced?100:500);return()=>clearTimeout(timer);}
  },[transition,reduced,cancel]);
  useEffect(()=>()=>{active.current=false;},[]);
  return {transition,active,begin,settle,cancel};
}
export function EncounterOverlay({transition,reduced}:{transition:NonNullable<ReturnType<typeof useEncounterTransition>['transition']>;reduced:boolean}){
  return <div className={'encounter-overlay encounter-'+(reduced?'reduced':transition.style)+(transition.closed?' is-closed':'')+(transition.opening?' is-opening':'')} role="status" aria-label="草丛里出现了宝可梦" data-encounter-style={transition.style}>
    <div className="encounter-curtain"/><div className="encounter-glint"/>
    {transition.closed&&!transition.settled&&<span className="encounter-wait">草丛里传来了动静…</span>}
  </div>;
}
