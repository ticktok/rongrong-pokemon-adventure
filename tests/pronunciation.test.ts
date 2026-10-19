import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../content/pronunciations.json',()=>({default:{apple:'assets/word-audio/apple.mp3',cat:'assets/word-audio/cat.mp3'}}));
import {playPronunciation,pronunciationSnapshot,stopPronunciation} from '../src/pronunciation';
class FakeAudio{
 static instances:FakeAudio[]=[];onended:(()=>void)|null=null;onerror:(()=>void)|null=null;onplaying:(()=>void)|null=null;onwaiting:(()=>void)|null=null;
 volume=1;playbackRate=1;preservesPitch=false;
 pause=vi.fn();load=vi.fn();removeAttribute=vi.fn();play=vi.fn(async()=>{});
 constructor(public src:string){FakeAudio.instances.push(this);}
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('Audio',FakeAudio);FakeAudio.instances=[];});
afterEach(()=>{stopPronunciation();vi.useRealTimers();vi.unstubAllGlobals();});
describe('shared recording player',()=>{
 it('plays a same-origin recording and stops previous audio on a new word',()=>{
  playPronunciation(' Apple ');const first=FakeAudio.instances[0];expect(first.src).toContain('assets/word-audio/apple.mp3');expect(first.play).toHaveBeenCalledOnce();
  first.onplaying?.();expect(pronunciationSnapshot().status).toBe('playing');
  const staleEnd=first.onended;playPronunciation('cat');expect(first.pause).toHaveBeenCalled();staleEnd?.();expect(pronunciationSnapshot().word).toBe('cat');
 });
 it('reports missing recordings without invoking device synthesis',()=>{
  playPronunciation('new custom word');expect(FakeAudio.instances).toHaveLength(0);expect(pronunciationSnapshot().message).toContain('准备中');
  playPronunciation('__proto__');expect(FakeAudio.instances).toHaveLength(0);
 });
 it('reports blocked playback and allows a new click to retry',async()=>{
  // A separate constructor simulates the browser rejecting play permission.
  class BlockedAudio extends FakeAudio{play=vi.fn(()=>Promise.reject(new DOMException('blocked','NotAllowedError')));}
  vi.stubGlobal('Audio',BlockedAudio);playPronunciation('apple');await Promise.resolve();expect(pronunciationSnapshot().message).toContain('未允许');
  vi.stubGlobal('Audio',FakeAudio);playPronunciation('apple');FakeAudio.instances.at(-1)!.onplaying?.();expect(pronunciationSnapshot().status).toBe('playing');
 });
 it('stops failed or stalled audio and ignores late callbacks',()=>{
  playPronunciation('apple');const first=FakeAudio.instances[0],late=first.onplaying;vi.advanceTimersByTime(12000);expect(pronunciationSnapshot().message).toContain('超时');late?.();expect(pronunciationSnapshot().status).toBe('error');
  playPronunciation('cat');FakeAudio.instances.at(-1)!.onerror?.();expect(pronunciationSnapshot().message).toContain('无法播放');expect(FakeAudio.instances.at(-1)!.pause).toHaveBeenCalled();
 });
});
