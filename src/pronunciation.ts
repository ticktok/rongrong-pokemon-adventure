import recordings from '../content/pronunciations.json';

type Playback={word:string;status:'idle'|'loading'|'playing'|'error';message:string};
let snapshot:Playback={word:'',status:'idle',message:''};
let player:HTMLAudioElement|undefined, timer:ReturnType<typeof setTimeout>|undefined;
let generation=0;
const listeners=new Set<()=>void>();
const publish=(value:Playback)=>{snapshot=value;listeners.forEach(fn=>fn());};
export const pronunciationSnapshot=()=>snapshot;
export const subscribePronunciation=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const normalizeWord=(word:string)=>word.trim().toLowerCase();
export function pronunciationPath(word:string):string|undefined{
  const key=normalizeWord(word);
  return Object.hasOwn(recordings,key)?(recordings as Record<string,string>)[key]:undefined;
}
export function stopPronunciation(){
  generation++;clearTimeout(timer);
  if(player){player.onended=null;player.onerror=null;player.onplaying=null;player.onwaiting=null;player.pause();player.removeAttribute('src');player.load();player=undefined;}
  publish({word:'',status:'idle',message:''});
}
export function playPronunciation(input:string){
  stopPronunciation();
  const word=normalizeWord(input),path=pronunciationPath(word),token=generation;
  if(!path){publish({word,status:'error',message:'这个词的标准音频还在准备中。'});return;}
  const audio=new Audio(import.meta.env.BASE_URL+path);player=audio;
  audio.volume=0.9;audio.playbackRate=0.9;audio.preservesPitch=true;
  const fail=(message:string)=>{if(token!==generation)return;stopPronunciation();publish({word,status:'error',message});};
  const wait=()=>{if(token!==generation)return;publish({word,status:'loading',message:''});clearTimeout(timer);timer=setTimeout(()=>fail('音频加载超时，请检查网络后再点一次。'),12000);};
  audio.onplaying=()=>{if(token===generation){clearTimeout(timer);publish({word,status:'playing',message:''});}};
  audio.onwaiting=wait;
  audio.onended=()=>{if(token===generation)stopPronunciation();};
  audio.onerror=()=>fail('音频暂时无法播放，请检查网络后再点一次。');
  wait();
  // Call play directly inside the user's click, preserving mobile playback permission.
  void audio.play().catch((error:unknown)=>fail(error instanceof DOMException&&error.name==='NotAllowedError'?'浏览器未允许播放，请再点一次听单词。':'音频暂时无法播放，请检查网络后再点一次。'));
}
