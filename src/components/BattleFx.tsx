import {useEffect,useRef} from 'react';
import type Phaser from 'phaser';
import type {BattleEvent} from '../game/types';
import {MOVE_VISUALS} from '../game/move-effects';

interface Cue {event:BattleEvent|null;started:number}
export default function BattleFx({event,reduced}:{event:BattleEvent|null;reduced:boolean}){
 const host=useRef<HTMLDivElement>(null),cue=useRef<Cue>({event:null,started:0});
 useEffect(()=>{cue.current={event,started:performance.now()};},[event]);
 useEffect(()=>{
  if(!host.current||reduced)return;
  let game:Phaser.Game|undefined,cancelled=false,observer:ResizeObserver|undefined;
  import('phaser').then(({default:P})=>{
   if(cancelled||!host.current)return;
   class Effects extends P.Scene {
    ink!:Phaser.GameObjects.Graphics;
    create(){this.ink=this.add.graphics();}
    update(){
     const g=this.ink;g.clear();const current=cue.current,event=current.event;if(!event)return;
     const t=(performance.now()-current.started)/1000;
     const root=host.current?.parentElement;if(!root||t>1.1)return;
     const bounds=root.getBoundingClientRect();
     const center=(side:'own'|'enemy')=>{const r=root.querySelector('.'+side+'-sprite')?.getBoundingClientRect();return r?{x:r.left+r.width*.5-bounds.left,y:r.top+r.height*.5-bounds.top}:{x:bounds.width*.5,y:bounds.height*.5};};
     const source=center(event.side),target=center(event.side==='own'?'enemy':'own');
     if(event.kind==='capture'){
      const a=center('own'),b=center('enemy'),p=Math.min(1,t/.48),x=a.x+(b.x-a.x)*p,y=a.y+(b.y-a.y)*p-Math.sin(p*Math.PI)*90;
      g.fillStyle(0xfffcdf).fillCircle(x,y,12);g.fillStyle(0xe76a4c).fillEllipse(x,y-5,23,14);g.lineStyle(3,0x345747).strokeCircle(x,y,12).lineBetween(x-11,y,x+11,y);g.fillStyle(0xfffcdf).fillCircle(x,y,4);return;
     }
     if(event.kind!=='attack')return;
     const visual=MOVE_VISUALS[event.moveId];if(!visual)return;
     const {color,accent,shape,tier}=visual;
     const p=Math.max(0,Math.min(1,(t-.18)/.46)),fade=Math.min(1,t/.13)*Math.min(1,Math.max(0,(1.05-t)/.28));
     const dx=target.x-source.x,dy=target.y-source.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
     const at=(u:number,v=0)=>({x:source.x+dx*u+nx*v,y:source.y+dy*u+ny*v});
     const line=(points:{x:number;y:number}[],width:number,c=color,alpha=fade)=>{g.lineStyle(width,c,alpha).strokePoints(points,false);};
     const circle=(x:number,y:number,r:number,c=color,alpha=fade)=>{g.fillStyle(c,alpha).fillCircle(x,y,r);};
     const star=(x:number,y:number,r:number,c=accent)=>{const pts=Array.from({length:10},(_,i)=>({x:x+Math.cos(i*Math.PI/5-Math.PI/2)*(i%2?r*.4:r),y:y+Math.sin(i*Math.PI/5-Math.PI/2)*(i%2?r*.4:r)}));g.fillStyle(c,fade).fillPoints(pts,true);};
     const projectile=at(p);
     // All attacks get a restrained wind-up ring; their travel and impact geometry differs.
     if(t<.25){g.lineStyle(2,accent,fade).strokeCircle(source.x,source.y,8+t*65);}
     if(t>=.16){
      switch(shape){
       case 'beam':case 'jet':case 'breath':{
        const width=(shape==='beam'?11:shape==='breath'?24:6)+tier*7;
        const end=at(p);line([source,end],width,color,fade*.32);line([source,end],width*.56,color);line([source,end],Math.max(2,width*.18),accent);
        for(let i=0;i<12+tier*4;i++){const u=((i/16+t*2)%1)*p,q=at(u,Math.sin(i*3+t*15)*width*.6);circle(q.x,q.y,2+i%3,accent,fade*.7);}break;
       }
       case 'lightning':{
        for(let branch=0;branch<2+tier;branch++){const pts=Array.from({length:13},(_,i)=>at(p*i/12,i===0||i===12?0:Math.sin(i*4+Math.floor(t*18)+branch*3)*(10+tier*7)));
         line(pts,7,color,fade*.3);line(pts,3,color);line(pts,1,accent);}
        break;
       }
       case 'vine':{
        for(const sign of [-1,1]){const pts=Array.from({length:28},(_,i)=>at(p*i/27,Math.sin(i/27*Math.PI*3-t*9)*18*sign));line(pts,5);line(pts,1,accent);}break;
       }
       case 'stars':case 'leaves':case 'snow':case 'needles':case 'mud':{
        for(let i=0;i<9+tier*3;i++){const u=Math.max(0,Math.min(1,p*1.3-i*.035)),q=at(u,Math.sin(i*8)*26*Math.sin(u*Math.PI));
         if(shape==='stars')star(q.x,q.y,8+i%4);
         else if(shape==='leaves'){g.fillStyle(color,fade).fillEllipse(q.x,q.y,19,7);line([{x:q.x-8,y:q.y},{x:q.x+8,y:q.y}],1,accent);}
         else if(shape==='snow'){for(let j=0;j<3;j++){const a=j*Math.PI/3;line([{x:q.x-Math.cos(a)*7,y:q.y-Math.sin(a)*7},{x:q.x+Math.cos(a)*7,y:q.y+Math.sin(a)*7}],2,accent);}}
         else if(shape==='needles'){line([q,{x:q.x+dx/len*18,y:q.y+dy/len*18}],3,accent);}
         else circle(q.x,q.y,5+i%3);
        }break;
       }
       case 'flame':{
        for(let i=0;i<9;i++){const q=at(Math.max(0,p-i*.022),Math.sin(i*3+t*20)*9),r=8+i%4;circle(q.x,q.y,r,color,fade*.22);g.fillStyle(color,fade).fillPoints([{x:q.x-r,y:q.y+3},{x:q.x-r*.7,y:q.y-r*.8},{x:q.x-r*.25,y:q.y-r*.2},{x:q.x+Math.sin(t*16+i)*4,y:q.y-r*2},{x:q.x+r*.6,y:q.y-r*.5},{x:q.x+r,y:q.y+3},{x:q.x+r*.6,y:q.y+r},{x:q.x-r*.5,y:q.y+r}],true);circle(q.x,q.y+3,r*.5,accent);}break;
       }
       case 'wheel':case 'wave':case 'rings':case 'sonic':case 'pulse':case 'wind':{
        const radial=['rings','pulse'].includes(shape),c=radial?target:projectile;
        for(let i=0;i<4+tier;i++){const r=8+((t*70+i*12)%60);g.lineStyle(shape==='wheel'?6:3,i%2?accent:color,fade*(1-r/85));
         if(shape==='wind')g.strokeEllipse(c.x+Math.sin(i+t*8)*8,c.y+i*3,r*2,r*.8);
         else g.strokeCircle(c.x,c.y,r);}
        if(shape==='wheel')for(let i=0;i<10;i++){const a=i*Math.PI/5+t*16;circle(c.x+Math.cos(a)*24,c.y+Math.sin(a)*24,5,i%2?accent:color);}
        break;
       }
       case 'rock':case 'cage':case 'avalanche':{
        const count=shape==='rock'?1:shape==='cage'?5:9;
        for(let i=0;i<count;i++){const x=target.x+(i-(count-1)/2)*16,y=target.y-120+Math.min(1,p*1.4-i*.05)*120,r=13+i%3*3;
         g.fillStyle(color,fade).fillPoints([{x:x-r,y:y-r*.4},{x:x-5,y:y-r},{x:x+r,y:y-4},{x:x+r*.6,y:y+r},{x:x-r*.7,y:y+r*.6}],true);line([{x:x-r+4,y:y-3},{x:x-5,y:y-r+5},{x:x+r-5,y:y}],2,accent);
        }break;
       }
       case 'quake':{
        for(let i=0;i<5;i++){const y=target.y+30+i*10,x=target.x-65;line(Array.from({length:10},(_,j)=>({x:x+j*15,y:y+Math.sin(j*4+i)*8*p})),2+i%2,color,fade);}
        for(let i=0;i<12;i++)circle(target.x+Math.sin(i*14)*65,target.y+35-Math.sin(p*Math.PI)*((i%4+1)*10),3+i%3);break;
       }
       case 'slash':case 'cross':case 'claw':case 'wings':{
        const c=p<.65?projectile:target,count=shape==='claw'?3:shape==='cross'?2:shape==='wings'?2:1;
        for(let i=0;i<count;i++){const sign=shape==='cross'&&i===1?-1:1,off=(i-(count-1)/2)*14;line([{x:c.x-25,y:c.y-28*sign+off},{x:c.x+28,y:c.y+24*sign+off}],7,color);line([{x:c.x-25,y:c.y-28*sign+off},{x:c.x+28,y:c.y+24*sign+off}],2,accent);}break;
       }
       case 'fangs':{
        const c=target,gap=(1-p)*32;
        for(let i=-1;i<=1;i++){g.fillStyle(accent,fade).fillTriangle(c.x+i*18-7,c.y-25-gap,c.x+i*18+7,c.y-25-gap,c.x+i*18,c.y-3-gap);g.fillTriangle(c.x+i*18-7,c.y+25+gap,c.x+i*18+7,c.y+25+gap,c.x+i*18,c.y+3+gap);}break;
       }
       case 'fist':case 'dash':case 'headbutt':{
        const c=projectile;
        for(let i=-2;i<=2;i++)line([at(Math.max(0,p-.22),i*9),at(p,i*9)],2,accent,fade*.8);
        if(shape==='fist'){g.fillStyle(color,fade).fillRoundedRect(c.x-15,c.y-12,30,25,7);for(let i=0;i<4;i++)circle(c.x-10+i*7,c.y-12,5,accent);}else if(p>.8)star(target.x,target.y,24+tier*7);break;
       }
       case 'kiss':case 'moon':{
        const c=shape==='moon'?{x:source.x,y:source.y-28}:projectile;
        if(shape==='moon'){circle(c.x,c.y,28,accent);circle(c.x+10,c.y-10,24,color);line([c,at(p)],4,accent);}
        else{circle(c.x-6,c.y-4,8);circle(c.x+6,c.y-4,8);g.fillStyle(color,fade).fillTriangle(c.x-14,c.y,c.x+14,c.y,c.x,c.y+15);}break;
       }
       case 'haunt':case 'orb':case 'sludge':case 'bomb':{
        const c=shape==='haunt'?target:projectile,r=(shape==='bomb'?23:16)+tier*4;
        circle(c.x,c.y,r+9,color,fade*.2);circle(c.x,c.y,r,color);circle(c.x-4,c.y-5,r*.4,accent,fade*.8);
        for(let i=0;i<7;i++){const a=i*6.28/7+t*9;circle(c.x+Math.cos(a)*(r+9),c.y+Math.sin(a)*(r+9),3,color);}
        if(shape==='haunt'){circle(c.x-7,c.y-3,3,accent);circle(c.x+7,c.y-3,3,accent);}break;
       }
      }
     }
     if(t>.62&&event.effectiveness>0){const burst=(t-.62)/.4;g.lineStyle(3,accent,Math.max(0,1-burst)*.8).strokeCircle(target.x,target.y,12+burst*48);for(let i=0;i<8;i++){const a=i*Math.PI/4;line([{x:target.x+Math.cos(a)*(10+burst*25),y:target.y+Math.sin(a)*(10+burst*25)},{x:target.x+Math.cos(a)*(20+burst*45),y:target.y+Math.sin(a)*(20+burst*45)}],2,accent,Math.max(0,1-burst));}}
    }
   }
   game=new P.Game({type:P.AUTO,parent:host.current,width:host.current.clientWidth,height:host.current.clientHeight,transparent:true,scene:Effects,audio:{noAudio:true},banner:false,render:{antialias:true},fps:{target:60}});
   observer=new ResizeObserver(()=>{if(host.current)game?.scale.resize(host.current.clientWidth,host.current.clientHeight);});observer.observe(host.current);
  }).catch(error=>console.warn('招式画面暂不可用，仍会显示战斗结果',error));
  return()=>{cancelled=true;observer?.disconnect();game?.destroy(true);};
 },[reduced]);
 return <div ref={host} className="battle-fx" aria-hidden="true"/>;
}
