import {useEffect,useState} from 'react';
import {music,sceneMusic} from '../music';
import {subscribePronunciation,pronunciationSnapshot} from '../pronunciation';
import type {PublicState} from '../game/types';
import type {Playback} from './useBattlePlayback';

export function useMusic(state:PublicState|null,tab:string,playback:Playback|null){
  const [enabled,setEnabled]=useState(()=>{const saved=localStorage.getItem('rr-music');return saved?saved==='on':localStorage.getItem('rr-sound')!=='off';});
  const [volume,setVolume]=useState(()=>{const saved=localStorage.getItem('rr-music-volume');const value=saved===null?.25:Number(saved);return Number.isFinite(value)?Math.max(0,Math.min(1,value)):.25;});
  const track=sceneMusic(state,tab,playback?.events[0]?.before.battle??state?.battle??undefined);
  useEffect(()=>{
    const unload=(event:PageTransitionEvent)=>{if(event.persisted)music.visibility(false);else music.dispose();},unlock=()=>music.unlock(),visibility=()=>music.visibility(document.visibilityState==='visible');
    const speech=()=>{const status=pronunciationSnapshot().status;music.duck(status==='loading'||status==='playing');};
    window.addEventListener('pagehide',unload);window.addEventListener('pointerdown',unlock,{passive:true});window.addEventListener('keydown',unlock);
    window.addEventListener('pageshow',visibility);document.addEventListener('visibilitychange',visibility);const unsubscribe=subscribePronunciation(speech);visibility();speech();
    return()=>{window.removeEventListener('pagehide',unload);window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);window.removeEventListener('pageshow',visibility);document.removeEventListener('visibilitychange',visibility);unsubscribe();music.dispose();};
  },[]);
  useEffect(()=>{music.configure(enabled,volume);localStorage.setItem('rr-music',enabled?'on':'off');localStorage.setItem('rr-music-volume',String(volume));},[enabled,volume]);
  useEffect(()=>{music.cancelCue();music.setScene(track);},[tab]);
  useEffect(()=>{music.setScene(track);},[track]);
  useEffect(()=>{if(state?.question?.kind==='catch')music.preloadCapture();},[state?.question?.id]);
  return {enabled,setEnabled:(value:boolean)=>{music.configure(value,volume);if(value)music.unlock();setEnabled(value);},volume,setVolume};
}
