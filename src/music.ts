import tracks from '../content/bgm.json';
import {playEffect} from './audio';
import type {Battle,PublicState} from './game/types';

export type MusicTrack=keyof typeof tracks;
export interface MusicAsset {path:string;loopStart?:number;loopEnd?:number;gain:number}
export const REGION_MUSIC:Record<string,MusicTrack>={
  'home-meadow':'pallet','blue-river':'cerulean','sunny-harbor':'vermilion','leaf-garden':'celadon',
  'mist-forest':'forest','star-city':'pewter','ember-island':'cinnabar','evergreen-valley':'pewter',
};
export function sceneMusic(state:PublicState|null,tab:string,battle?:Battle):MusicTrack|null{
  if(!state?.started||state.role==='child'&&state.settings.childLocked)return null;
  if(['partners','pokedex','collection'].includes(tab))return 'center';
  if(tab!=='adventure')return null;
  if(battle?.status==='active')return battle.kind==='gym'?'gym-battle':'wild-battle';
  if(battle?.status==='won')return battle.kind==='gym'?'gym-victory':'wild-victory';
  return REGION_MUSIC[state.position.regionId]??'pallet';
}

interface Voice {source:AudioBufferSourceNode;gain:GainNode;track:MusicTrack;cue:boolean}
/** One music voice, plus at most one 300 ms fade-out. Presentation never waits for audio. */
export class MusicPlayer {
  private context?:AudioContext;
  private requests=new Set<AbortController>();
  private voice?:Voice;
  private voices=new Set<Voice>();
  private cache=new Map<MusicTrack,Promise<AudioBuffer>>();
  private wanted:MusicTrack|null=null;
  private cue:string|null=null;
  private lastCue='';
  private generation=0;
  private enabled=false;
  private volume=.25;
  private ducked=false;
  private visible=true;
  private unlocked=false;
  private loading:MusicTrack|null=null;
  constructor(private assets:Record<MusicTrack,MusicAsset>=tracks,private makeContext=()=>new AudioContext()){}

  snapshot(){return {track:this.voice?.track??null,loading:this.loading,enabled:this.enabled,volume:this.volume,ducked:this.ducked,visible:this.visible,voices:this.voices.size};}
  configure(enabled:boolean,volume:number){
    this.enabled=enabled;this.volume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):.25;
    if(!enabled){this.cue=null;this.stop();}else{this.adjustGain();void this.sync();}
  }
  setScene(track:MusicTrack|null){
    if(this.wanted===track){void this.sync();return;}
    this.wanted=track;
    if(!track){this.cancelCue();this.stop();return;}
    if(!this.cue)void this.sync();
  }
  cancelCue(){if(!this.cue)return;this.cue=null;this.stop();}
  duck(value:boolean){this.ducked=value;this.adjustGain(.08);}
  visibility(value:boolean){
    this.visible=value;
    if(!value){void this.context?.suspend().catch(e=>console.warn('背景音乐暂停失败',e.message));}
    else if(this.enabled&&this.unlocked)this.unlock();
  }
  unlock(){
    if(!this.enabled||!this.visible||!this.wanted)return;
    try{
      this.context??=this.makeContext();this.unlocked=true;
      // resume is invoked in the pointer/keyboard handler, before fetching or decoding.
      void this.context.resume().then(()=>this.sync()).catch(e=>console.warn('背景音乐等待再次点击',e.message));
    }catch(e){console.warn('背景音乐暂不可用',e instanceof Error?e.message:String(e));}
  }
  preloadCapture(){if(this.context&&this.enabled)void this.load('capture').catch(()=>{/* Playback reports an unavailable cue; prefetch is optional. */});}
  playCapture(id:string){
    if(this.lastCue===id)return true;this.lastCue=id;
    if(!this.enabled||!this.visible||!this.unlocked||!this.wanted)return false;
    return this.playCue('capture');
  }
  playCue(track:'capture'|'evolution'|'evolution-finish',loop=false){
    if(!this.enabled||!this.visible||!this.unlocked||!this.wanted)return false;
    this.cue=track;void this.start(track,true,loop);return true;
  }
  endCue(){
    this.cancelCue();void this.sync();
  }
  private target(voice:Voice){return this.volume*this.assets[voice.track].gain*(this.ducked?.2:1);}
  private adjustGain(seconds=.3){
    const c=this.context,v=this.voice;if(!c||!v)return;
    v.gain.gain.cancelScheduledValues(c.currentTime);v.gain.gain.setValueAtTime(v.gain.gain.value,c.currentTime);
    v.gain.gain.linearRampToValueAtTime(this.target(v),c.currentTime+seconds);
  }
  private async load(track:MusicTrack){
    const cached=this.cache.get(track);if(cached)return cached;
    const context=this.context;if(!context)throw new Error('Music not unlocked');
    const controller=new AbortController();this.requests.add(controller);
    const timeout=setTimeout(()=>controller.abort(),12000);
    const promise=(async()=>{
      try{
        const response=await fetch(import.meta.env.BASE_URL+this.assets[track].path,{signal:controller.signal});
        if(!response.ok)throw new Error('HTTP '+response.status);
        return await context.decodeAudioData(await response.arrayBuffer());
      }finally{clearTimeout(timeout);this.requests.delete(controller);}
    })();
    this.cache.set(track,promise);
    // Keep only the current scene and a small number of recently used buffers.
    while(this.cache.size>3){const oldest=this.cache.keys().next().value!;this.cache.delete(oldest);}
    try{return await promise;}catch(e){if(this.cache.get(track)===promise)this.cache.delete(track);throw e;}
  }
  private async sync(){
    if(!this.enabled||!this.visible||!this.unlocked||!this.wanted||this.cue)return;
    if(this.voice?.track===this.wanted||this.loading===this.wanted)return;
    await this.start(this.wanted,false);
  }
  private async start(track:MusicTrack,cue:boolean,loopCue=false){
    const c=this.context;if(!c)return;
    const token=++this.generation;this.loading=track;
    // Stop the previous theme immediately if loading the next one takes a long time.
    this.retire(this.voice,.3);this.voice=undefined;
    try{
      const buffer=await this.load(track);
      if(token!==this.generation||!this.enabled)return;
      this.loading=null;
      const source=c.createBufferSource(),gain=c.createGain(),asset=this.assets[track];
      source.buffer=buffer;source.loop=!cue||loopCue;
      if(!cue){source.loopStart=asset.loopStart??0;source.loopEnd=asset.loopEnd??buffer.duration;}
      const voice:Voice={source,gain,track,cue};this.voice=voice;this.voices.add(voice);
      source.connect(gain);gain.connect(c.destination);gain.gain.setValueAtTime(0,c.currentTime);
      gain.gain.linearRampToValueAtTime(this.target(voice),c.currentTime+(cue?.04:.3));
      source.onended=()=>{
        source.disconnect();gain.disconnect();this.voices.delete(voice);
        if(this.voice!==voice)return;
        this.voice=undefined;if(cue){this.cue=null;void this.sync();}
      };
      source.start();
    }catch(e){
      if(token!==this.generation)return;
      this.loading=null;console.warn('背景音乐暂不可用',track,e instanceof Error?e.message:String(e));
      if(cue){this.cue=null;void this.sync();}
    }
  }
  private retire(voice:Voice|undefined,seconds:number){
    if(!voice||!this.context)return;
    const now=this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);
    voice.gain.gain.linearRampToValueAtTime(0,now+seconds);voice.source.stop(now+seconds);
  }
  private stop(){
    this.generation++;this.loading=null;this.voice=undefined;
    for(const voice of this.voices){voice.source.onended=null;voice.source.stop();voice.source.disconnect();voice.gain.disconnect();}
    this.voices.clear();
  }
  dispose(){
    this.stop();for(const request of this.requests)request.abort();this.requests.clear();this.cue=null;this.lastCue='';this.wanted=null;this.cache.clear();this.unlocked=false;
    const context=this.context;this.context=undefined;
    void context?.close().catch(e=>console.warn('背景音乐关闭失败',e.message));
  }
}
export const music=new MusicPlayer();
export function playCaptureCue(id:string,effectsEnabled=false){if(!music.playCapture(id))playEffect('catch',effectsEnabled);}
