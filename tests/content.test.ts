import {describe,it,expect} from 'vitest';
import {REGIONS,PACKS} from '../content/packs';
import {isWalkable,COLS,ROWS} from '../content/geometry';
import {parseWordCsv} from '../src/game/csv';
describe('maps and imports',()=>{
 it('keeps every gate, gym and NPC placement reachable',()=>{
   const points=[[8,16],[14,16],[23,19],[30,14],[34,19],[11,12],[14,14],[9,19],[14,21],[24,17],[30,11],[19,1],[19,24]];
   for(const r of REGIONS){
     const queue=[[12,16]],seen=new Set(['12,16']);
     for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,key=nx+','+ny;if(!seen.has(key)&&nx>=0&&ny>=0&&nx<COLS&&ny<ROWS&&isWalkable(nx,ny,r.biome)){seen.add(key);queue.push([nx,ny]);}}}
     expect(points.every(([x,y])=>seen.has(x+','+y))).toBe(true);
   }
 });
 it('has unique stable IDs across registered content packs',()=>{
   const ids=PACKS.flatMap(p=>p.species.map(s=>s.id));expect(new Set(ids).size).toBe(ids.length);
   expect(new Set(REGIONS.map(r=>r.id)).size).toBe(REGIONS.length);
 });
 it('parses quoted CSV, BOM and escaped quotation marks',()=>{
   const r=parseWordCsv('\uFEFFword,meaning,topic,level,example\r\napple,苹果,食物,1,"Look, an ""apple""."\r\n');
   expect(r.errors).toEqual([]);expect(r.words[0].example).toBe('Look, an "apple".');
 });
 it('reports duplicates, invalid difficulty and unfinished quotes',()=>{
   expect(parseWordCsv('word,meaning,topic,level,example\ncat,猫,动物,1,A cat.\nCAT,猫,动物,4,A cat.').errors).toHaveLength(1);
   expect(parseWordCsv('word,meaning,topic,level,example\ncat,猫,动物,1,"A cat.').errors.length).toBe(1);
 });
});
