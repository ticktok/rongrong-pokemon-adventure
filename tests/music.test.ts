import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MusicPlayer,REGION_MUSIC,sceneMusic} from '../src/music';
import {initialState,publicState} from '../server/state';
import {captureTimeline} from '../src/game/presentation';
import type {BattleEvent} from '../src/game/types';
import {existsSync,readFileSync} from 'node:fs';
import tracks from '../content/bgm.json';
class Source {
  buffer:unknown;loop=false;loopStart=0;loopEnd=0;onended:(()=>void)|null=null;
  connect=vi.fn();disconnect=vi.fn();start=vi.fn();stop=vi.fn();
}
class Context {
  currentTime=0;destination={};sources:Source[]=[];
  resume=vi.fn(async()=>{});suspend=vi.fn(async()=>{});close=vi.fn(async()=>{});
  decodeAudioData=vi.fn(async()=>({duration:150}));
  createBufferSource(){const s=new Source();this.sources.push(s);return s;}
  createGain(){return {connect:vi.fn(),disconnect:vi.fn(),gain:{value:0,cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()}};}
}
let context:Context,player:MusicPlayer;
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
beforeEach(()=>{context=new Context();player=new MusicPlayer(tracks,()=>context as unknown as AudioContext);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})));});
afterEach(()=>{player.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('music lifecycle',()=>{
  it('waits for interaction, keeps the same song through state refreshes and uses measured loop points',async()=>{
    player.configure(true,.25);player.setScene('pallet');await flush();expect(fetch).not.toHaveBeenCalled();
    player.unlock();await flush();expect(context.sources).toHaveLength(1);expect(context.sources[0].loopStart).toBe(tracks.pallet.loopStart);
    for(let i=0;i<5;i++){player.cancelCue();player.setScene('pallet');player.unlock();}await flush();expect(context.sources).toHaveLength(1);
    player.duck(true);expect(player.snapshot().ducked).toBe(true);player.duck(false);
    player.visibility(false);expect(context.suspend).toHaveBeenCalledOnce();player.visibility(true);await flush();expect(context.sources).toHaveLength(1);
    player.configure(false,.25);expect(context.sources[0].stop).toHaveBeenCalled();expect(player.snapshot().track).toBe(null);
  });
  it('never starts a stale download after switching to a quiet page or disabling music',async()=>{
    let resolve!:(v:unknown)=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{resolve=r;})));
    player.configure(true,.25);player.setScene('pallet');player.unlock();await flush();
    player.setScene(null);resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await flush();expect(context.sources).toHaveLength(0);
  });
  it('plays a capture cue once and returns to the latest scene after it finishes',async()=>{
    player.configure(true,.25);player.setScene('wild-battle');player.unlock();await flush();
    player.playCapture('operation-1');await flush();const cue=context.sources.at(-1)!;expect(cue.loop).toBe(false);
    player.setScene('pallet');player.playCapture('operation-1');await flush();expect(context.sources).toHaveLength(2);
    cue.onended?.();await flush();expect(player.snapshot().track).toBe('pallet');
    player.playCapture('operation-1');await flush();expect(context.sources).toHaveLength(3);
  });
  it('a failed cue restores the scene and a late download cannot resurrect disposed playback',async()=>{
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    player.configure(true,.25);player.setScene('pallet');player.unlock();await flush();
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:404})));player.playCapture('failed');await flush();expect(player.snapshot().track).toBe('pallet');
    player.dispose();await flush();expect(player.snapshot().track).toBe(null);expect(context.close).toHaveBeenCalled();
  });
});
describe('scene and capture policy',()=>{
  it('covers all eight regions and keeps learning, parent and locked sessions quiet',()=>{
    const state=publicState(initialState([],new Date('2026-11-15T08:00:00Z'),'QA'),'child',0,new Date('2026-11-15T08:00:00Z'));state.started=true;
    for(const [id,track] of Object.entries(REGION_MUSIC)){state.position.regionId=id;expect(sceneMusic(state,'adventure')).toBe(track);}
    expect(sceneMusic(state,'partners')).toBe('center');expect(sceneMusic(state,'learning')).toBe(null);expect(sceneMusic(state,'parent')).toBe(null);
    state.settings.childLocked=true;expect(sceneMusic(state,'adventure')).toBe(null);
  });
  it('reveals capture only after shakes, and reduced motion keeps a definitive outcome',()=>{
    const event={after:{battle:{status:'caught'}}} as BattleEvent;
    const success=captureTimeline(event,false);expect(success.phases.filter(([,p])=>p.startsWith('shake'))).toHaveLength(3);expect(success.reveal).toBe(2800);expect(success.duration).toBe(3500);
    event.after.battle.status='active';const failure=captureTimeline(event,false);expect(failure.phases.filter(([,p])=>p.startsWith('shake'))).toHaveLength(2);expect(failure.phases.at(-1)?.[1]).toBe('breakout');
    expect(captureTimeline(event,true)).toMatchObject({duration:400,reveal:0,phases:[[0,'breakout']]});
  });
  it('ships all referenced local recordings and valid bounded loop points',()=>{
    for(const [key,track] of Object.entries(tracks)){
      expect(existsSync('public/'+track.path)).toBe(true);expect(readFileSync('public/'+track.path).length).toBeGreaterThan(1000);
      if('loopStart'in track){expect(track.loopStart).toBeGreaterThanOrEqual(0);expect(track.loopEnd).toBeGreaterThan(track.loopStart+5);}
      else expect(key).toBe('capture');
    }
  });
});
