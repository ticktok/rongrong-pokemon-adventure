import {useEffect,useRef,useState} from 'react';
import {pokemon} from '../game/catalog';
import {asset} from '../lib';
import {music} from '../music';
import './Evolution.css';

export interface EvolutionScene {from:number;to:number;confirmed:boolean}
interface Props {
  scene:EvolutionScene;reduced:boolean;busy:boolean;pending:boolean;error:string;
  retry:()=>void;close:()=>void;
}
export default function Evolution({scene,reduced,busy,pending,error,retry,close}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const [ready,setReady]=useState(false);
  const reveal=ready&&scene.confirmed;
  const failed=!!error&&!scene.confirmed;
  const from=pokemon(scene.from).name,to=pokemon(scene.to).name;
  useEffect(()=>{
    const element=dialog.current!;
    element.showModal();
    return ()=>element.close();
  },[]);
  useEffect(()=>{
    const timer=setTimeout(()=>setReady(true),reduced?600:5100);
    return ()=>clearTimeout(timer);
  },[reduced]);
  useEffect(()=>{
    if(failed)return;
    music.playCue(reveal?'evolution-finish':'evolution',!reveal);
    return ()=>music.endCue();
  },[failed,reveal]);
  const message=failed?error:reveal?'恭喜！'+from+'进化成'+to+'了！':ready?'正在确认进化结果……':'等等，'+from+'的样子……？';
  return <dialog ref={dialog} className={'evolution-scene'+(reveal?' revealed':'')+(reduced?' reduced':'')} aria-label="宝可梦进化" onCancel={e=>{e.preventDefault();if(reveal||failed&&!pending)close();}}>
    <div className="evolution-stage">
      <div className="evolution-portraits" aria-hidden="true"><img className="evolution-before" src={asset('art',scene.from)} alt=""/><img className="evolution-after" src={asset('art',scene.to)} alt=""/></div>
      <div className="evolution-dialogue"><h2 aria-live="polite">{message}</h2>
      {reveal&&<button className="primary" autoFocus onClick={close}>继续</button>}
      {failed&&<button className="primary" disabled={busy} onClick={pending?retry:close}>{pending?'重试':'返回伙伴'}</button>}</div>
    </div>
  </dialog>;
}
