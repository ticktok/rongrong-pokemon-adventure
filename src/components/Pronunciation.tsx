import {useSyncExternalStore,type ReactNode} from 'react';
import {LoaderCircle,Volume2} from 'lucide-react';
import {normalizeWord,playPronunciation,pronunciationSnapshot,subscribePronunciation} from '../pronunciation';

export default function Pronunciation({word,children,className='pronounce'}:{word:string;children?:ReactNode;className?:string}){
  const audio=useSyncExternalStore(subscribePronunciation,pronunciationSnapshot);
  const active=audio.word===normalizeWord(word),status=active?audio.status:'idle';
  return <span className="pronunciation-control"><button type="button" className={className} onClick={()=>playPronunciation(word)} aria-label={'听单词 '+word} aria-busy={status==='loading'}>
    {children??<>{status==='loading'?<LoaderCircle className="spin" size={18}/>:<Volume2 size={18}/>}<span>{status==='loading'?'正在加载…':status==='playing'?'正在播放 · 再听一次':status==='error'?'重试播放':'听单词'}</span></>}
    {children&&status==='playing'&&<small>正在播放</small>}
  </button>{active&&audio.message&&<small className="pronunciation-error" role="status">{audio.message}</small>}</span>;
}
