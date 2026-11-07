import type {Npc} from '../src/game/types';
export const COLS=40,ROWS=26,TILE=32;
export type Point=readonly [number,number];
export type Terrain='land'|'path'|'grass'|'water'|'tree'|'rock'|'bridge'|'building';
export interface Discovery {id:string;name:string;x:number;y:number;word:string;description:string}
export interface MapBuilding {x:number;y:number;name:string;kind:'home'|'gym'|'landmark'}
export interface RegionMap {id:string;tiles:Terrain[][];spawn:Point;entry:Point;exit:Point;gym:Point;buildings:MapBuilding[];discoveries:Discovery[];land:number;path:number;water:number}
interface Design {id:string;biome:string;route:Point[];loop:Point[];entry:Point;exit:Point;gym:Point;home:Point;points:[string,number,number,string,string][];grass:Point[]}
const designs:Design[]=[
 {id:'home-meadow',biome:'meadow',entry:[3,16],exit:[35,5],gym:[29,9],home:[8,8],route:[[3,16],[12,16],[20,16],[20,9],[29,9],[35,9],[35,5]],loop:[[12,16],[12,22],[28,22],[28,16]],grass:[[5,19],[23,18]],points:[['研究小站',8,11,'home','从家门口认识世界。观察研究小站里的伙伴足迹。'],['花田',17,22,'flower','花朵之间也有小小的生命，放慢脚步看一看。'],['岩石观察点',33,15,'rock','沿着石纹寻找不同形状，山的故事写在岩石里。']]},
 {id:'blue-river',biome:'river',entry:[4,22],exit:[35,4],gym:[30,8],home:[8,10],route:[[4,22],[10,22],[10,16],[27,16],[27,8],[35,8],[35,4]],loop:[[10,16],[10,5],[27,5],[27,16]],grass:[[4,15],[30,18]],points:[['河桥',19,16,'water','桥下的溪水向远方流去，听听水的声音。'],['瀑布观景台',19,5,'water','白色水花从高处落下，找找瀑布旁的彩虹。'],['水边生态点',32,21,'fish','岸边有鱼游过的波纹，轻轻靠近，不惊动它们。']]},
 {id:'sunny-harbor',biome:'coast',entry:[3,7],exit:[35,22],gym:[10,11],home:[7,5],route:[[3,7],[14,7],[14,16],[30,16],[30,22],[35,22]],loop:[[14,7],[24,7],[24,16],[14,16]],grass:[[4,18],[17,19]],points:[['灯塔',27,5,'light','灯塔的光帮助船只找到回家的方向。'],['停泊船',34,16,'boat','数一数船上的窗户，想象一次海上旅行。'],['潮池',24,22,'sea','退潮后留下的小水池，是海边伙伴的家。']]},
 {id:'leaf-garden',biome:'garden',entry:[4,13],exit:[35,13],gym:[28,7],home:[7,8],route:[[4,13],[12,13],[20,13],[28,13],[35,13]],loop:[[12,13],[12,21],[28,21],[28,7],[20,7],[20,13]],grass:[[4,18],[31,18]],points:[['温室',12,6,'green','温暖的玻璃房里，叶子长得格外精神。'],['喷泉',20,17,'water','看看水珠落下的圆圈，让眼睛休息一下。'],['花钟',25,21,'flower','不同颜色的花围成一圈，像一只大时钟。']]},
 {id:'mist-forest',biome:'forest',entry:[4,22],exit:[34,3],gym:[29,13],home:[6,14],route:[[4,22],[10,22],[10,13],[18,13],[18,6],[29,6],[34,6],[34,3]],loop:[[10,13],[10,6],[18,6],[24,6],[24,20],[10,20]],grass:[[4,5],[28,18]],points:[['观察亭',6,9,'bird','躲在亭子里安静观察，树梢可能有鸟。'],['古树',17,20,'tree','摸不到的高高树冠，遮住了午后的阳光。'],['湿地',30,22,'frog','在湿地旁停一停，听听青蛙的声音。']]},
 {id:'star-city',biome:'city',entry:[3,18],exit:[36,6],gym:[29,11],home:[7,10],route:[[3,18],[12,18],[20,18],[20,11],[29,11],[36,11],[36,6]],loop:[[12,18],[12,6],[29,6],[29,20],[20,20],[20,18]],grass:[[5,20],[31,19]],points:[['钟楼',12,6,'clock','钟声告诉大家时间，认真观察指针的位置。'],['天文台',28,20,'star','白天想象星空，夜晚的星星藏着许多问题。'],['城市展板',6,18,'school','看看街区的路线图，找到自己所在的位置。']]},
 {id:'ember-island',biome:'volcano',entry:[5,22],exit:[34,5],gym:[27,10],home:[7,15],route:[[5,22],[14,22],[14,16],[22,16],[22,10],[34,10],[34,5]],loop:[[14,16],[8,16],[8,7],[22,7],[22,16]],grass:[[5,19],[27,18]],points:[['温泉',9,7,'warm','温泉冒出轻轻的白雾，在安全的岸边观察。'],['火山观察台',30,5,'mountain','从观察台看看火山，不靠近热热的岩石。'],['研究遗址',29,21,'rock','旧墙上留下的痕迹，记录着过去的发现。']]},
 {id:'evergreen-valley',biome:'mountain',entry:[4,21],exit:[35,4],gym:[29,9],home:[8,13],route:[[4,21],[13,21],[13,16],[23,16],[23,9],[35,9],[35,4]],loop:[[13,21],[30,21],[30,16],[23,16],[13,16],[13,8],[23,8],[23,16]],grass:[[4,6],[30,18]],points:[['山口',13,8,'mountain','山风吹过路牌，前方还有新的风景。'],['化石岩壁',7,21,'rock','找找岩壁里的形状，想象很久以前的世界。'],['纪念观景台',32,21,'happy','回望走过的山谷，你和伙伴都在慢慢长大。']]},
];
const palettes:Record<string,[number,number,number]>={meadow:[0xa8ce8b,0xead3a2,0x81c5d0],river:[0xb1d4a1,0xe6d5ac,0x73baca],coast:[0xe8d6a3,0xf4e4b8,0x77b6ca],garden:[0xb6d4a0,0xe8d5b9,0x8bcbd0],forest:[0x82b398,0xcad0a0,0x6bafa4],city:[0xc5d1b2,0xe7dfc8,0x9bc9ce],volcano:[0xc5ad90,0xe7c796,0xd98765],mountain:[0xadc09a,0xd8c8a6,0x8ebbb7]};
function build(d:Design):RegionMap{
 const tiles:Terrain[][]=Array.from({length:ROWS},(_,y)=>Array.from({length:COLS},(_,x)=>{
  if(!x||!y||x===COLS-1||y===ROWS-1)return 'tree';
  if(d.biome==='river'&&(x>=17&&x<=21||y>=9&&y<=11&&x>=20&&x<=34))return 'water';
  if(d.biome==='coast'&&(x>=28||y>=23))return 'water';
  if(d.biome==='volcano'&&((x-27)**2+(y-5)**2<20))return 'water';
  if(d.biome==='forest'&&x>=27&&y>=18)return 'water';
  if(d.biome==='garden'&&x>=18&&x<=22&&y>=16&&y<=18)return 'water';
  if(d.biome==='mountain'&&(x===17||x===26)&&y<20)return 'rock';
  if(d.grass.some(([gx,gy])=>x>=gx&&x<=gx+4&&y>=gy&&y<=gy+3))return 'grass';
  if(d.biome==='forest'&&(x*7+y*11)%9<2)return 'tree';
  if(d.biome==='garden'&&[4,10,19,23].includes(y)&&x>3&&x<35)return 'tree';
  if((x*7+y*11+designs.indexOf(d)*3)%37===0)return d.biome==='mountain'||d.biome==='volcano'?'rock':'tree';
  return 'land';
 }));
 const buildings:MapBuilding[]=[{x:d.home[0],y:d.home[1],name:d.id==='home-meadow'?'伙伴之家':'朋友驿站',kind:'home'},{x:d.gym[0],y:d.gym[1]-2,name:'道馆',kind:'gym'}];
 if(d.biome==='city')buildings.push({x:6,y:6,name:'城市学堂',kind:'landmark'},{x:33,y:17,name:'街角小店',kind:'landmark'});
 if(d.biome==='coast')buildings.push({x:20,y:12,name:'港口小站',kind:'landmark'});
 for(const b of buildings)for(let y=b.y-2;y<=b.y;y++)for(let x=b.x-2;x<=b.x+2;x++)if(y>0&&x>0&&y<ROWS-1&&x<COLS-1)tiles[y][x]='building';
 // Route after placing footprints: every segment avoids buildings, including gym approaches.
 const path=(points:readonly Point[])=>{for(let i=1;i<points.length;i++){
  const start=points[i-1],target=points[i],queue:Point[]=[start],previous=new Map<string,Point|null>([[start.join(','),null]]);
  for(let j=0;j<queue.length;j++){
   const point=queue[j];if(point[0]===target[0]&&point[1]===target[1])break;
   const neighbors=([[1,0],[-1,0],[0,1],[0,-1]] as Point[]).map(([dx,dy])=>[point[0]+dx,point[1]+dy] as Point).sort((a,b)=>(Math.abs(a[0]-target[0])+Math.abs(a[1]-target[1]))-(Math.abs(b[0]-target[0])+Math.abs(b[1]-target[1])));
   for(const p of neighbors){const [x,y]=p,key=p.join(',');if(x>0&&x<COLS-1&&y>0&&y<ROWS-1&&tiles[y][x]!=='building'&&!previous.has(key)){previous.set(key,point);queue.push(p);}}
  }
  let point:Point|null=target;
  while(point&&previous.has(point.join(','))){const [x,y]=point;tiles[y][x]=tiles[y][x]==='water'||tiles[y][x]==='bridge'?'bridge':'path';point=previous.get(point.join(','))??null;}
 }};

 path(d.route);path(d.loop);
 const discovery=d.points.map(([name,x,y,word,description],i)=>({id:d.id+'-discovery-'+(i+1),name,x,y,word,description}));
 for(const point of [d.gym,[d.home[0],d.home[1]+2] as Point,...discovery.map(p=>[p.x,p.y] as Point)]){
  const near=[...d.route,...d.loop].reduce((best,p)=>Math.abs(p[0]-point[0])+Math.abs(p[1]-point[1])<Math.abs(best[0]-point[0])+Math.abs(best[1]-point[1])?p:best);
  path([near,point]);
 }
 const [land,road,water]=palettes[d.biome];return {id:d.id,tiles,spawn:d.entry,entry:d.entry,exit:d.exit,gym:d.gym,buildings,discoveries:discovery,land,path:road,water};
}
export const MAPS:RegionMap[]=designs.map(build);
export function mapOf(id:string):RegionMap{return MAPS.find(m=>m.id===id)??MAPS[designs.findIndex(d=>d.biome===id)]??MAPS[0];}
export function terrainAt(x:number,y:number,id='home-meadow'):Terrain|undefined{return mapOf(id).tiles[y]?.[x];}
export function isWater(x:number,y:number,id:string){return terrainAt(x,y,id)==='water';}
export function isGrass(x:number,y:number,id='home-meadow'){return terrainAt(x,y,id)==='grass';}
export function isWalkable(x:number,y:number,id:string){const tile=terrainAt(x,y,id);return x>0&&y>0&&x<COLS-1&&y<ROWS-1&&!!tile&&!['water','tree','rock','building'].includes(tile);}
export function reachable(id:string):Point[]{
 const map=mapOf(id),queue:Point[]=[map.spawn],seen=new Set([map.spawn.join(',')]);
 for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const point:Point=[x+dx,y+dy],key=point.join(',');if(!seen.has(key)&&isWalkable(...point,id)){seen.add(key);queue.push(point);}}}
 return queue;
}
export function safePoint(id:string,x:number,y:number,occupied:readonly Point[]=[]):Point{
 const choices=reachable(id).filter(([px,py])=>!occupied.some(([ox,oy])=>ox===px&&oy===py));
 return choices.reduce((best,p)=>Math.abs(p[0]-x)+Math.abs(p[1]-y)<Math.abs(best[0]-x)+Math.abs(best[1]-y)?p:best,choices[0]??mapOf(id).spawn);
}
export function placedNpcs(npcs:Npc[],id:string):Npc[]{
 const m=mapOf(id),used:Point[]=[m.entry,m.exit,m.gym,...m.discoveries.map(p=>[p.x,p.y] as Point),...m.tiles.flatMap((row,y)=>row.flatMap((tile,x)=>tile==='path'||tile==='bridge'?[[x,y] as Point]:[]))];
 return npcs.filter(n=>n.regionId===id).map(n=>{const [x,y]=safePoint(id,n.x,n.y,used);used.push([x,y]);return {...n,x,y};});
}
