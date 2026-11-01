import {useEffect,useRef,useState} from 'react';
import type Phaser from 'phaser';
import {ArrowUp,ArrowDown,ArrowLeft,ArrowRight,MessageCircle,Shield,MapPin} from 'lucide-react';
import {REGIONS} from '../../content/world';
import {COLS,ROWS,TILE,TREES,isGrass,isWater,isWalkable} from '../../content/geometry';
import type {Npc,PublicState} from '../game/types';
import type {Run} from '../lib';
interface Props {state:PublicState;busy:boolean;run:Run;onNpc:(npc:Npc)=>void;reduced:boolean}
export default function World(props:Props){
  const host=useRef<HTMLDivElement>(null),latest=useRef(props),held=useRef(''),interact=useRef<()=>void>(()=>{}),[near,setNear]=useState(''),[gymConfirm,setGymConfirm]=useState(false),[exitHint,setExitHint]=useState('');
  const confirming=useRef(false);confirming.current=gymConfirm;
  latest.current=props;
  const region=REGIONS.find(r=>r.id===props.state.position.regionId)!;
  useEffect(()=>{
    let game:Phaser.Game|undefined,disposed=false;let observer:ResizeObserver|undefined;
    import('phaser').then(async({default:P})=>{
      await document.fonts.load('13px "Noto Sans SC"',latest.current.state.npcs.map(n=>n.name).join(''));
      if(disposed||!host.current)return;
      const position=latest.current.state.position;
      class AdventureScene extends P.Scene {
        hero!:Phaser.GameObjects.Container;buddy!:Phaser.GameObjects.Image;tx=position.x;ty=position.y;moving=false;nextMove=0;lastEncounter=0;lastSaved='';saveEvent?:Phaser.Time.TimerEvent;
        keys!:Record<string,Phaser.Input.Keyboard.Key>;nearNpc:Npc|undefined;
        preload(){this.load.image('town',import.meta.env.BASE_URL+'assets/town/tilemap_packed.png');const first=latest.current.state.partners.find(p=>latest.current.state.team.includes(p.id));if(first)this.load.image('buddy',import.meta.env.BASE_URL+'assets/pokemon/front/'+first.speciesId+'.png');}
        create(){
          const palette=region.biome==='volcano'?{land:0xd9b493,path:0xefcf9c,water:0xe97d55}:region.biome==='coast'?{land:0xb8d699,path:0xf1d897,water:0x6ab7cb}:{land:0xa5cc85,path:0xe5ce9d,water:0x80c7cc};
          this.cameras.main.setBackgroundColor(palette.land);
          const source=this.textures.get('town').getSourceImage() as HTMLImageElement;
          const crops:Record<string,number[]>={grass:[0,0,16,16],flower:[32,0,16,16],tree:[64,0,16,32],bush:[64,32,16,16]};
          for(const [name,[x,y,w,h]] of Object.entries(crops)){const texture=this.textures.createCanvas(name,w,h)!;texture.context.drawImage(source,x,y,w,h,0,0,w,h);texture.refresh();}
          for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
            this.add.rectangle(x*TILE,y*TILE,TILE,TILE,palette.land).setOrigin(0);
            if(x%7===0||y%9===0)this.add.image(x*TILE+16,y*TILE+16,'grass').setScale(2).setAlpha(0.22);
            const road=(y>=15&&y<=17)||(x>=18&&x<=20)||(y>=10&&y<=16&&((x>=7&&x<=9)||(x>=29&&x<=31)));
            if(road){this.add.rectangle(x*TILE,y*TILE,TILE,TILE,palette.path).setOrigin(0);if((x+y)%3===0)this.add.rectangle(x*TILE+5,y*TILE+9,4,3,0xd1b889).setAlpha(0.5);}
            if(isGrass(x,y)){this.add.rectangle(x*TILE,y*TILE,TILE,TILE,0x80b976).setOrigin(0);for(let k=0;k<3;k++)this.add.text(x*TILE+3+k*9,y*TILE+6+(k%2)*6,'⌃',{fontSize:'16px',color:'#4e945a'});}
            if(isWater(x,y,region.biome)){this.add.rectangle(x*TILE,y*TILE,TILE,TILE,palette.water).setOrigin(0);this.add.rectangle(x*TILE+4,y*TILE+12,18,2,0xe0f6ec).setAlpha(0.4);}
            if(!road&&!isGrass(x,y)&&!isWater(x,y,region.biome)&&(x*3+y*7)%31===0)this.add.image(x*TILE+16,y*TILE+16,'flower').setScale(2);
          }
          for(let x=0;x<COLS;x++)for(const y of [0,ROWS-1])if(x<18||x>21)this.tree(x,y);
          for(let y=1;y<ROWS-1;y++)for(const x of [0,COLS-1])this.tree(x,y);
          TREES.forEach(([x,y])=>this.tree(x,y));
          this.house(8,7,region.id==='home-meadow'?'伙伴之家':'朋友驿站',0xdb7762);
          this.house(30,7,region.leader+'的道馆',0x4d819b);
          this.sign(19,23,'下一站 →');this.sign(19,2,'← 来时的路');
          this.add.text(4*TILE,11*TILE,'野生伙伴的草丛',{fontFamily:'"Noto Sans SC"',fontSize:'14px',color:'#426c46',backgroundColor:'#f5f2d5',padding:{x:8,y:4}}).setDepth(2);
          const npcs=latest.current.state.npcs.filter(n=>n.regionId===region.id);
          npcs.forEach((n,i)=>{this.person(n.x*TILE+16,n.y*TILE+16,n.kind==='family'?0xe69b65:[0x6a9eb3,0x9c86b2,0xe1b66b,0xd88c82][i%4],false);this.add.text(n.x*TILE+16,n.y*TILE-12,n.name,{fontFamily:'"Noto Sans SC"',fontSize:'13px',fontStyle:'bold',color:'#354b46',backgroundColor:'#fff8e8dd',padding:{x:5,y:3}}).setOrigin(0.5).setDepth(20);});
          this.hero=this.person(this.tx*TILE+16,this.ty*TILE+16,0xd55e4d,true);
          if(this.textures.exists('buddy'))this.buddy=this.add.image(this.hero.x-29,this.hero.y+4,'buddy').setScale(0.58).setDepth(19);
          this.cameras.main.setBounds(0,0,COLS*TILE,ROWS*TILE);this.cameras.main.startFollow(this.hero,true,0.12,0.12);this.cameras.main.roundPixels=true;
          if(this.input.keyboard){
            this.keys=this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,E,SPACE') as Record<string,Phaser.Input.Keyboard.Key>;
            this.input.keyboard.on('keydown-E',()=>this.interaction());this.input.keyboard.on('keydown-SPACE',()=>this.interaction());
          }
          interact.current=()=>this.interaction();
        }
        tree(x:number,y:number){this.add.ellipse(x*TILE+17,y*TILE+25,34,15,0x4c7757,0.2);this.add.image(x*TILE+16,y*TILE+2,'tree').setScale(2.3).setDepth(y*TILE+2).setTint(region.biome==='volcano'?0xe2c39a:0xffffff);}
        house(x:number,y:number,label:string,color:number){
          const px=x*TILE,py=y*TILE;
          this.add.ellipse(px+15,py+75,230,40,0x426d4b,0.15);
          const g=this.add.graphics();g.fillStyle(0xf6dfaf);g.fillRoundedRect(px-90,py-30,190,113,4);g.fillStyle(0xbfa173);g.fillRect(px-95,py+72,200,10);
          g.fillStyle(color);g.fillTriangle(px-110,py-25,px+110,py-25,px,py-118);g.fillRect(px-110,py-28,220,12);
          g.lineStyle(3,0xffffff,0.2);for(let i=0;i<4;i++)g.lineBetween(px-75+i*20,py-80+i*15,px+75-i*20,py-80+i*15);
          g.fillStyle(0x6e5847);g.fillRoundedRect(px-20,py+24,40,58,4);g.fillStyle(0xefc85a);g.fillCircle(px+11,py+57,3);
          for(const dx of [-62,62]){g.fillStyle(0x82bac6);g.fillRect(px+dx-17,py+1,34,33);g.lineStyle(4,0xfff0ce);g.strokeRect(px+dx-17,py+1,34,33);g.lineBetween(px+dx,py+1,px+dx,py+34);g.lineBetween(px+dx-17,py+17,px+dx+17,py+17);}
          this.add.text(px,py-8,label,{fontFamily:'"Noto Sans SC"',fontSize:'16px',fontStyle:'bold',color:'#354b46',backgroundColor:'#fff5d8',padding:{x:9,y:4}}).setOrigin(0.5).setDepth(5);
        }
        sign(x:number,y:number,label:string){this.add.rectangle(x*TILE,y*TILE+10,5,27,0x8a704f);this.add.text(x*TILE,y*TILE,label,{fontFamily:'"Noto Sans SC"',fontSize:'12px',color:'#6b5135',backgroundColor:'#fff0c5',padding:{x:7,y:5}}).setOrigin(0.5);}
        person(x:number,y:number,color:number,hero:boolean){
          const c=this.add.container(x,y).setDepth(20),g=this.add.graphics();
          g.fillStyle(0x334a42,0.18);g.fillEllipse(0,12,26,10);
          g.fillStyle(0x40516a);g.fillRect(-8,7,6,8);g.fillRect(3,7,6,8);
          g.fillStyle(color);g.fillRoundedRect(-11,-6,22,17,3);
          g.fillStyle(0xf6c999);g.fillCircle(0,-15,10);g.fillRect(-14,-3,4,10);g.fillRect(11,-3,4,10);
          g.fillStyle(hero?0xd45144:0x705142);g.fillRoundedRect(-11,-26,22,10,3);if(hero){g.fillStyle(0xffeac4);g.fillRect(-14,-19,21,4);}
          g.fillStyle(0x3b453c);g.fillRect(-5,-15,3,3);g.fillRect(4,-15,3,3);
          g.fillStyle(0xffedbd);g.fillRect(-4,-3,8,3);c.add(g);return c;
        }
        interaction(){
          if(confirming.current||latest.current.busy||latest.current.state.question)return;
          if(this.nearNpc){latest.current.onNpc(this.nearNpc);return;}
          if(Math.hypot(this.tx-30,this.ty-11)<3){setGymConfirm(true);return;}
        }
        update(time:number){
          const p=latest.current;
          if(confirming.current||!this.hero||p.busy||p.state.question||this.moving)return;
          const npcs=p.state.npcs.filter(n=>n.regionId===region.id);
          this.nearNpc=npcs.find(n=>Math.hypot(n.x-this.tx,n.y-this.ty)<2.4);
          const near=this.nearNpc?'和'+this.nearNpc.name+'聊一聊':Math.hypot(this.tx-30,this.ty-11)<3?'进入道馆':'';
          setNear(old=>old===near?old:near);
          if(time<this.nextMove)return;
          let dx=0,dy=0;
          if(held.current==='up'||this.keys?.UP?.isDown||this.keys?.W?.isDown)dy=-1;
          else if(held.current==='down'||this.keys?.DOWN?.isDown||this.keys?.S?.isDown)dy=1;
          else if(held.current==='left'||this.keys?.LEFT?.isDown||this.keys?.A?.isDown)dx=-1;
          else if(held.current==='right'||this.keys?.RIGHT?.isDown||this.keys?.D?.isDown)dx=1;
          if(!dx&&!dy)return;
          const x=this.tx+dx,y=this.ty+dy;this.nextMove=time+130;
          if(!isWalkable(x,y,region.biome)||npcs.some(n=>n.x===x&&n.y===y))return;
          const oldX=this.hero.x,oldY=this.hero.y;this.tx=x;this.ty=y;this.moving=true;
          this.tweens.add({targets:this.hero,x:x*TILE+16,y:y*TILE+16,duration:p.reduced?0:115,onComplete:()=>{this.moving=false;this.arrived(time);}});
          if(this.buddy)this.tweens.add({targets:this.buddy,x:oldX-14,y:oldY+6,duration:p.reduced?0:170});
          this.saveEvent?.remove();
          this.saveEvent=this.time.delayedCall(1100,()=>this.save());
        }
        save(){const key=this.tx+':'+this.ty;if(key!==this.lastSaved&&!latest.current.busy){this.lastSaved=key;void latest.current.run('world.position',{regionId:region.id,x:this.tx,y:this.ty});}}
        arrived(time:number){
          const state=latest.current.state;
          const index=REGIONS.findIndex(r=>r.id===region.id);
          setExitHint('');
          if(this.tx>=18&&this.tx<=21&&(this.ty===24||this.ty===1)){
            const next=REGIONS[index+(this.ty===24?1:-1)];
            if(next&&!state.adventureAccess?.[next.id]?.regionOpen)setExitHint(state.adventureAccess?.[next.id]?.regionReason??'暂未开放');
            if(next&&state.adventureAccess?.[next.id]?.regionOpen){void latest.current.run('world.position',{regionId:next.id,x:19,y:this.ty===24?3:22});return;}
          }
          if(isGrass(this.tx,this.ty)&&state.canBattle&&state.daily.encounters<state.settings.captureLimit&&time-this.lastEncounter>10000&&Math.random()<0.11){
            this.lastEncounter=time;void latest.current.run('encounter');
          }
        }
      }
      game=new P.Game({type:P.AUTO,parent:host.current,width:host.current.clientWidth,height:host.current.clientHeight,backgroundColor:'#a5cc85',pixelArt:true,roundPixels:true,scene:AdventureScene,render:{antialias:false},audio:{noAudio:true},banner:false});
      observer=new ResizeObserver(()=>{if(host.current&&game)game.scale.resize(host.current.clientWidth,host.current.clientHeight);});observer.observe(host.current);
    });
    return()=>{disposed=true;held.current='';observer?.disconnect();game?.destroy(true);};
  },[region.id]);
  return <div className="world-wrap">
    <div className="map-label"><MapPin size={14}/><span>{region.name}</span><small>{region.subtitle}</small></div>
    <div className="gym-status" role="status">{exitHint||props.state.adventureAccess?.[region.id]?.gymReason||'今日道馆剩余 '+props.state.gymRemaining+' 次'}</div>
    {gymConfirm&&<div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-label="道馆挑战确认"><h2>{region.leader}的道馆</h2><p>{props.state.adventureAccess?.[region.id]?.gymReason||'每天 1 次，失败或退出也计次。准备好和伙伴一起挑战了吗？'}</p><button className="primary" disabled={props.busy||!props.state.adventureAccess?.[region.id]?.gymAvailable} onClick={async()=>{setGymConfirm(false);await props.run('gym.start');}}>开始挑战</button><button onClick={()=>setGymConfirm(false)}>再准备一下</button></section></div>}
    <div ref={host} className="world-canvas" role="application" aria-label={region.name+'冒险地图，使用方向键或屏幕方向键移动'}/>
    <div className="map-controls">
      <div className="dpad" aria-label="移动方向">
        {([['up',ArrowUp,'向上'],['left',ArrowLeft,'向左'],['down',ArrowDown,'向下'],['right',ArrowRight,'向右']] as const).map(([direction,Icon,label])=><button key={direction} className={direction} aria-label={label} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);held.current=direction;}} onPointerUp={()=>held.current=''} onPointerCancel={()=>held.current=''}><Icon size={22}/></button>)}
      </div>
      <div className="map-hint">方向键 / WASD 移动<span>E / 空格 互动</span></div>
      <button className={'interact '+(near?'available':'')} disabled={!near||props.busy} onClick={()=>interact.current()}>{near.includes('道馆')?<Shield size={23}/>:<MessageCircle size={23}/>}<span>{near||'走近朋友'}</span></button>
    </div>
  </div>;
}
