import {describe,it,expect} from 'vitest';
import {REGIONS,PACKS} from '../content/packs';
import {MAPS,reachable,placedNpcs} from '../content/geometry';
import {parseWordCsv} from '../src/game/csv';
describe('maps and imports',()=>{
 it('keeps every gate, gym and NPC placement reachable',()=>{
   for(const map of MAPS){
     const points=[map.entry,map.exit,map.gym,...map.discoveries.map(d=>[d.x,d.y])];
     const seen=new Set(reachable(map.id).map(p=>p.join(',')));
     for(const point of points)expect(seen.has(point.join(',')),map.id+' '+point).toBe(true);
     const npcs=placedNpcs([{id:'test',name:'朋友',regionId:map.id,x:0,y:0,kind:'family',line:'你好',quest:'观察'}],map.id);
     expect(seen.has([npcs[0].x,npcs[0].y].join(','))).toBe(true);
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
