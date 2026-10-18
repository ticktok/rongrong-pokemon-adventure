export const COLS=40,ROWS=26,TILE=32;
export const TREES=[[2,3],[3,3],[4,3],[13,4],[14,4],[16,3],[18,5],[23,3],[24,3],[25,3],[35,4],[36,5],[37,5],[2,10],[3,10],[14,10],[15,11],[25,12],[26,12],[35,11],[36,11],[2,22],[3,22],[4,23],[8,23],[11,23],[25,23],[29,22],[30,22],[35,23],[37,22]];
export function isWater(x:number,y:number,biome:string){return (biome==='river'||biome==='coast'||biome==='volcano')&&x>=18&&x<=24&&y>=7&&y<=11;}
export function isGrass(x:number,y:number){return (x>=3&&x<=8&&y>=12&&y<=20)||(x>=28&&x<=36&&y>=17&&y<=21);}
export function isWalkable(x:number,y:number,biome:string){
  if(x<1||y<1||x>=COLS-1||y>=ROWS-1)return false;
  if((x>=5&&x<=11&&y>=4&&y<=9)||(x>=27&&x<=33&&y>=4&&y<=9))return false;
  if(isWater(x,y,biome))return false;
  return !TREES.some(([tx,ty])=>tx===x&&ty===y);
}
