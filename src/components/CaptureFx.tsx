import {useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {Star} from 'lucide-react';
import type {CapturePhase} from '../game/presentation';

export function CaptureStars(){return <span className="capture-stars" aria-hidden="true">{[0,1,2].map(i=><Star key={i} fill="currentColor"/>)}</span>;}
export default function CaptureFx({phase,reduced}:{phase:CapturePhase;reduced:boolean}){
  const host=useRef<HTMLDivElement>(null);
  const [points,setPoints]=useState({x:0,y:0,dx:0,dy:0});
  useLayoutEffect(()=>{
    const root=host.current?.parentElement;if(!root)return;
    const measure=()=>{
      const r=root.getBoundingClientRect(),own=root.querySelector('.own-sprite') as HTMLElement|null,enemy=root.querySelector('.enemy-sprite') as HTMLElement|null;
      if(!own||!enemy)return;
      // Layout offsets remain stable while the enemy sprite shrinks into the ball.
      const x=enemy.offsetLeft+enemy.offsetWidth/2,y=enemy.offsetTop+enemy.offsetHeight/2;
      setPoints({x,y,dx:own.offsetLeft+own.offsetWidth/2-x,dy:own.offsetTop+own.offsetHeight/2-y});
      if(!r.width)return;
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(root);return()=>observer.disconnect();
  },[]);
  const style={'--ball-x':points.x+'px','--ball-y':points.y+'px','--throw-x':points.dx+'px','--throw-y':points.dy+'px'} as CSSProperties;
  return <div ref={host} className={'capture-fx phase-'+phase+(reduced?' capture-reduced':'')} style={style} data-capture-phase={phase} aria-hidden="true">
    <div className="capture-ball-position"><div key={phase} className="capture-ball-motion"><div className="pokeball capture-ball"/></div>
      {phase==='success'&&<><span className="capture-flash"/><CaptureStars/></>}
      {phase==='breakout'&&<span className="capture-breakout"/>}
    </div>
  </div>;
}
