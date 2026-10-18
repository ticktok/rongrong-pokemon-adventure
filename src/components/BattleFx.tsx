import {useEffect,useRef} from 'react';
import type Phaser from 'phaser';
export default function BattleFx({effect,turn,active}:{effect:string;turn:number;active:boolean}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!host.current||!['attack','win','gift','lose'].includes(effect)||document.documentElement.dataset.reduced==='true')return;
    let game:Phaser.Game|undefined,cancelled=false;
    import('phaser').then(({default:P})=>{
      if(cancelled||!host.current)return;
      const w=host.current.clientWidth,h=host.current.clientHeight;
      class Effects extends P.Scene {
        create(){
          const shoot=(reverse=false)=>{
            const start={x:w*(reverse?0.76:0.23),y:h*(reverse?0.36:0.78)},end={x:w*(reverse?0.23:0.76),y:h*(reverse?0.78:0.36)};
            const orb=this.add.circle(start.x,start.y,9,reverse?0xf4b88b:0xffe576).setBlendMode(P.BlendModes.ADD);
            this.tweens.add({targets:orb,x:end.x,y:end.y,duration:360,ease:'Quad.easeIn',onComplete:()=>{
              orb.destroy();
              for(let i=0;i<14;i++){const angle=i*Math.PI*2/14,spark=this.add.circle(end.x,end.y,i%3+2,0xffed9e);this.tweens.add({targets:spark,x:end.x+Math.cos(angle)*65,y:end.y+Math.sin(angle)*48,alpha:0,duration:420,onComplete:()=>spark.destroy()});}
            }});
          };
          shoot();if(active)this.time.delayedCall(610,()=>shoot(true));
        }
      }
      game=new P.Game({type:P.AUTO,parent:host.current,width:w,height:h,transparent:true,scene:Effects,audio:{noAudio:true},banner:false,render:{antialias:true}});
    });
    return()=>{cancelled=true;game?.destroy(true);};
  },[effect,turn,active]);
  return <div ref={host} className="battle-fx" aria-hidden="true"/>;
}
