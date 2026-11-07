import {useEffect,useMemo,useRef,useState} from 'react';
import type Phaser from 'phaser';
import {ArrowUp,ArrowDown,ArrowLeft,ArrowRight,MessageCircle,Shield,MapPin} from 'lucide-react';
import {REGIONS} from '../../content/world';
import {COLS,ROWS,TILE,mapOf,placedNpcs,isGrass,isWalkable} from '../../content/geometry';
import type {Npc,PublicState} from '../game/types';
import Dialog from './Dialog';
import Pronunciation from './Pronunciation';
import {LocalMap} from './WorldMaps';
import type {Run} from '../lib';
interface Props {state:PublicState;busy:boolean;run:Run;onNpc:(npc:Npc)=>void;reduced:boolean}
export default function World(props:Props){
  const host=useRef<HTMLDivElement>(null),latest=useRef(props),held=useRef(''),interact=useRef<()=>void>(()=>{}),[near,setNear]=useState(''),[gymConfirm,setGymConfirm]=useState(false),[exitHint,setExitHint]=useState(''),[discoveryId,setDiscoveryId]=useState(''),[cursor,setCursor]=useState(props.state.position),[walking,setWalking]=useState(false);
  const confirming=useRef(false);confirming.current=gymConfirm||!!discoveryId;
  latest.current=props;
  const npcRef=useRef<Npc[]>([]);
  const visibleNpcs=useMemo(()=>placedNpcs(props.state.npcs,props.state.position.regionId),[props.state.npcs,props.state.position.regionId]);npcRef.current=visibleNpcs;
  const region=REGIONS.find(r=>r.id===props.state.position.regionId)!;
  const map=mapOf(region.id),discovery=map.discoveries.find(d=>d.id===discoveryId);
  const lead=props.state.partners.find(p=>p.id===props.state.team[0]);
  useEffect(()=>{
    let game:Phaser.Game|undefined,disposed=false;let observer:ResizeObserver|undefined;
    import('phaser').then(async({default:P})=>{
      await document.fonts.load('13px "Noto Sans SC"',latest.current.state.npcs.map(n=>n.name).join(''));
      if(disposed||!host.current)return;
      const position=latest.current.state.position;
      class AdventureScene extends P.Scene {
        hero!:Phaser.GameObjects.Container;buddy!:Phaser.GameObjects.Image;tx=position.x;ty=position.y;moving=false;syncing=false;nextMove=0;lastEncounter=0;lastSaved='';saveEvent?:Phaser.Time.TimerEvent;
        keys!:Record<string,Phaser.Input.Keyboard.Key>;nearNpc:Npc|undefined;nearDiscovery='';
        preload(){this.load.image('town',import.meta.env.BASE_URL+'assets/town/tilemap_packed.png');const first=latest.current.state.partners.find(p=>p.id===latest.current.state.team[0]);if(first)this.load.image('buddy',import.meta.env.BASE_URL+'assets/pokemon/front/'+first.speciesId+'.png');}
        create(){
          const palette={land:map.land,path:map.path,water:map.water};
          this.cameras.main.setBackgroundColor(palette.land);
          const source=this.textures.get('town').getSourceImage() as HTMLImageElement;
          const crops:Record<string,number[]>={grass:[0,0,16,16],flower:[32,0,16,16],tree:[64,0,16,32],bush:[64,32,16,16]};
          for(const [name,[x,y,w,h]] of Object.entries(crops)){const texture=this.textures.createCanvas(name,w,h)!;texture.context.drawImage(source,x,y,w,h,0,0,w,h);texture.refresh();}
          for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
            const tile=map.tiles[y][x],px=x*TILE,py=y*TILE;
            this.add.rectangle(px,py,TILE,TILE,palette.land).setOrigin(0);
            if(tile==='path'||tile==='bridge'){this.add.rectangle(px,py,TILE,TILE,tile==='bridge'?0xb79a6c:palette.path).setOrigin(0);if(tile==='bridge')for(let k=0;k<4;k++)this.add.rectangle(px+16,py+4+k*8,30,2,0x725f48);else if((x+y)%3===0)this.add.rectangle(px+5,py+9,4,3,0xbda780).setAlpha(.4);}
            if(tile==='grass'){this.add.rectangle(px,py,TILE,TILE,0x80b976).setOrigin(0);for(let k=0;k<3;k++)this.add.text(px+3+k*9,py+6+(k%2)*6,'⌃',{fontSize:'16px',color:'#4e945a'});}
            if(tile==='water'){this.add.rectangle(px,py,TILE,TILE,palette.water).setOrigin(0);this.add.rectangle(px+4,py+12,18,2,0xe0f6ec).setAlpha(.5);}
            if(tile==='tree')this.tree(x,y);
            if(tile==='rock'){this.add.ellipse(px+16,py+20,30,24,0x929a87);this.add.ellipse(px+13,py+14,23,16,0xbac1a9);}
            if(tile==='land'&&region.biome==='city'){this.add.rectangle(px,py,31,31,0xcbd0bc).setOrigin(0);}
            if(tile==='path'&&region.biome==='city'&&(x+y)%6===0){this.add.rectangle(px+29,py+12,3,23,0x64746b);this.add.circle(px+29,py,5,0xf4dea0);}
            if(tile==='land'&&(x*3+y*7)%(region.biome==='garden'?7:region.biome==='meadow'?13:31)===0)this.add.image(px+16,py+16,'flower').setScale(2);
          }
          map.buildings.forEach(b=>this.house(b.x,b.y-1,b.kind==='gym'?region.leader+'的道馆':b.name,b.kind==='gym'?0x4d819b:0xc98464));
          this.sign(map.entry[0],map.entry[1],'← 来时的路');this.sign(map.exit[0],map.exit[1],'下一站 →');
          map.discoveries.forEach((d,i)=>{
            const px=d.x*TILE+16,py=d.y*TILE+16,done=latest.current.state.discoveries?.includes(d.id);
            const g=this.add.graphics().setDepth(py-24);g.fillStyle(0x3e6250,.18);g.fillEllipse(px,py-12,68,22);
            if(d.name.includes('塔')||d.name.includes('台')||d.name.includes('亭')||d.name.includes('楼')){g.fillStyle(0xe8dfbc);g.fillRect(px-16,py-76,32,58);g.fillStyle(0x5b8d83);g.fillTriangle(px-27,py-76,px+27,py-76,px,py-100);g.fillStyle(0xedc875);g.fillCircle(px,py-61,8);}
            else if(d.word==='boat'){g.fillStyle(0x926d4e);g.fillTriangle(px-42,py-35,px+42,py-35,px+20,py-10);g.fillStyle(0xfff4d6);g.fillTriangle(px,py-86,px,py-38,px+34,py-38);g.fillStyle(0x765d45);g.fillRect(px-2,py-88,4,60);}
            else if(d.word==='flower'||d.word==='green'){for(let k=0;k<5;k++){g.fillStyle([0xdaa18b,0xe9ce72,0xf1e5b9][k%3]);g.fillCircle(px-28+k*14,py-35-(k%2)*10,10);}}
            else if(d.word==='rock'||d.word==='old'){g.fillStyle(0x8a9683);g.fillRoundedRect(px-30,py-52,60,37,10);g.lineStyle(2,0xd5dbbd);g.strokeCircle(px,py-34,10);}
            else if(d.word==='warm'||d.word==='water'){g.fillStyle(0x9fae91);g.fillEllipse(px,py-35,70,44);g.fillStyle(0x8dc5c5);g.fillEllipse(px,py-37,56,30);g.lineStyle(2,0xe8f4db);g.strokeEllipse(px,py-38,38,12);}
            else {g.fillStyle(0x6b977c);g.fillEllipse(px,py-36,66,40);g.fillStyle(0xc8dfb2);g.fillEllipse(px-8,py-41,30,19);}
            this.add.text(px,py+8,(done?'✓ ':'◇ ')+d.name,{fontFamily:'"Noto Sans SC"',fontSize:'12px',color:'#354b46',backgroundColor:'#fff8e8ee',padding:{x:6,y:4}}).setOrigin(.5,0).setDepth(1000+i);
          });
          const npcs=npcRef.current;
          npcs.forEach((n,i)=>{this.person(n.x*TILE+16,n.y*TILE+16,n.kind==='family'?0xe69b65:[0x6a9eb3,0x97a572,0xe1b66b,0xd88c82][i%4],false);this.add.text(n.x*TILE+16,n.y*TILE-12,n.name,{fontFamily:'"Noto Sans SC"',fontSize:'13px',fontStyle:'bold',color:'#354b46',backgroundColor:'#fff8e8dd',padding:{x:5,y:3}}).setOrigin(.5).setDepth(1000);});
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
        async interaction(){
          if(confirming.current||latest.current.busy||latest.current.state.question||this.syncing||this.moving)return;
          if(!await this.save())return;
          if(this.nearNpc){latest.current.onNpc(this.nearNpc);return;}
          if(this.nearDiscovery){const result=await latest.current.run('world.interact',{discoveryId:this.nearDiscovery});if(result?.ok&&!disposed)setDiscoveryId(this.nearDiscovery);return;}
          if(Math.hypot(this.tx-map.gym[0],this.ty-map.gym[1])<3)setGymConfirm(true);
        }
        update(time:number){
          const p=latest.current;
          if(confirming.current||!this.hero||p.busy||p.state.question||this.moving||this.syncing)return;
          const npcs=npcRef.current;
          this.nearNpc=npcs.find(n=>Math.hypot(n.x-this.tx,n.y-this.ty)<2.4);
          this.nearDiscovery=map.discoveries.find(d=>Math.hypot(d.x-this.tx,d.y-this.ty)<2.4)?.id??'';
          const near=this.nearNpc?'和'+this.nearNpc.name+'聊一聊':this.nearDiscovery?'观察'+map.discoveries.find(d=>d.id===this.nearDiscovery)!.name:Math.hypot(this.tx-map.gym[0],this.ty-map.gym[1])<3?'进入道馆':'';
          setNear(old=>old===near?old:near);
          if(time<this.nextMove)return;
          let dx=0,dy=0;
          if(held.current==='up'||this.keys?.UP?.isDown||this.keys?.W?.isDown)dy=-1;
          else if(held.current==='down'||this.keys?.DOWN?.isDown||this.keys?.S?.isDown)dy=1;
          else if(held.current==='left'||this.keys?.LEFT?.isDown||this.keys?.A?.isDown)dx=-1;
          else if(held.current==='right'||this.keys?.RIGHT?.isDown||this.keys?.D?.isDown)dx=1;
          if(!dx&&!dy)return;
          const x=this.tx+dx,y=this.ty+dy;this.nextMove=time+130;
          if(!isWalkable(x,y,region.id)||npcs.some(n=>n.x===x&&n.y===y))return;
          const oldX=this.hero.x,oldY=this.hero.y;this.tx=x;this.ty=y;setCursor({regionId:region.id,x,y});this.moving=true;setWalking(true);
          this.tweens.add({targets:this.hero,x:x*TILE+16,y:y*TILE+16,duration:p.reduced?0:115,onComplete:()=>{this.moving=false;setWalking(false);this.arrived(time);}});
          if(this.buddy)this.tweens.add({targets:this.buddy,x:oldX-14,y:oldY+6,duration:p.reduced?0:170});
          this.saveEvent?.remove();
          this.saveEvent=this.time.delayedCall(1100,()=>this.save());
        }
        async save(){
          this.saveEvent?.remove();
          if(disposed||this.syncing||latest.current.busy)return false;
          const key=this.tx+':'+this.ty;if(key===this.lastSaved)return true;
          this.syncing=true;
          try{const result=await latest.current.run('world.position',{regionId:region.id,x:this.tx,y:this.ty});if(result?.ok)this.lastSaved=key;return !!result?.ok&&!disposed;}
          finally{this.syncing=false;}
        }
        async arrived(time:number){
          const state=latest.current.state,index=REGIONS.findIndex(r=>r.id===region.id);
          setExitHint('');
          const forward=this.tx===map.exit[0]&&this.ty===map.exit[1],back=this.tx===map.entry[0]&&this.ty===map.entry[1];
          if(forward||back){
            const next=REGIONS[index+(forward?1:-1)];
            if(next&&!state.adventureAccess?.[next.id]?.regionOpen)setExitHint(state.adventureAccess?.[next.id]?.regionReason??'暂未开放');
            if(next&&state.adventureAccess?.[next.id]?.regionOpen&&await this.save()){
              const nextMap=mapOf(next.id),point=forward?nextMap.entry:nextMap.exit;
              await latest.current.run('world.position',{regionId:next.id,x:point[0],y:point[1]});return;
            }
          }
          if(isGrass(this.tx,this.ty,region.id)&&state.canBattle&&state.daily.encounters<state.settings.captureLimit&&time-this.lastEncounter>10000&&Math.random()<.11){
            this.lastEncounter=time;if(await this.save())await latest.current.run('encounter');
          }
        }

      }
      game=new P.Game({type:P.AUTO,parent:host.current,width:host.current.clientWidth,height:host.current.clientHeight,backgroundColor:'#a5cc85',pixelArt:true,roundPixels:true,scene:AdventureScene,render:{antialias:false},audio:{noAudio:true},banner:false});
      observer=new ResizeObserver(()=>{if(host.current&&game)game.scale.resize(host.current.clientWidth,host.current.clientHeight);});observer.observe(host.current);
    });
    return()=>{disposed=true;held.current='';observer?.disconnect();game?.destroy(true);};
  },[region.id,lead?.id,lead?.speciesId]);
  return <div className="world-wrap">
    <div className="map-label"><MapPin size={14}/><span>{region.name}</span><small>{region.subtitle}</small></div>
    <div className="gym-status" role="status">{exitHint||props.state.adventureAccess?.[region.id]?.gymReason||'今日道馆剩余 '+props.state.gymRemaining+' 次'}</div>
    {gymConfirm&&<div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-label="道馆挑战确认"><h2>{region.leader}的道馆</h2><p>{props.state.adventureAccess?.[region.id]?.gymReason||'每天 1 次，失败或退出也计次。准备好和伙伴一起挑战了吗？'}</p><button className="primary" disabled={props.busy||!props.state.adventureAccess?.[region.id]?.gymAvailable} onClick={async()=>{setGymConfirm(false);await props.run('gym.start');}}>开始挑战</button><button onClick={()=>setGymConfirm(false)}>再准备一下</button></section></div>}
    <LocalMap regionId={region.id} x={cursor.regionId===region.id?cursor.x:props.state.position.x} y={cursor.regionId===region.id?cursor.y:props.state.position.y} discoveries={props.state.discoveries??[]}/>
    {discovery&&<Dialog title={discovery.name} onClose={()=>setDiscoveryId('')}><span className="eyebrow">关都发现 · 已收集</span><p>{discovery.description}</p><Pronunciation word={discovery.word}><span>{discovery.word}</span></Pronunciation><p>本区发现 {map.discoveries.filter(d=>props.state.discoveries?.includes(d.id)).length} / 3</p><button className="primary" onClick={()=>setDiscoveryId('')}>继续探索</button></Dialog>}
    <div ref={host} className="world-canvas" role="application" aria-label={region.name+'冒险地图，使用方向键或屏幕方向键移动'}/>
    <div className="map-controls">
      <div className="dpad" aria-label="移动方向">
        {([['up',ArrowUp,'向上'],['left',ArrowLeft,'向左'],['down',ArrowDown,'向下'],['right',ArrowRight,'向右']] as const).map(([direction,Icon,label])=><button key={direction} className={direction} aria-label={label} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);held.current=direction;}} onPointerUp={()=>held.current=''} onPointerCancel={()=>held.current=''}><Icon size={22}/></button>)}
      </div>
      <div className="map-hint">方向键 / WASD 移动<span>E / 空格 互动</span></div>
      <button className={'interact '+(near?'available':'')} disabled={!near||props.busy||walking} onClick={()=>interact.current()}>{near.includes('道馆')?<Shield size={23}/>:<MessageCircle size={23}/>}<span>{near||'走近朋友'}</span></button>
    </div>
  </div>;
}
