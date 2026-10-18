import {ALL_SPECIES,ALL_EVOLUTIONS,encountersFor,NPC_GIFTS} from '../../content/packs';
import {MOVES,REGIONS} from '../../content/world';
import type {Species,Evolution,Partner} from './types';
export const catalog:Species[]=ALL_SPECIES;
export const evolutions:Evolution[]=ALL_EVOLUTIONS;
export const pokemon=(id:number)=>catalog.find(p=>p.id===id)!;
export const portraitMoves=(p:Partner)=>MOVES.filter(m=>['normal',...pokemon(p.speciesId).types].includes(m.type)&&m.level<=p.level);
export function acquisition(id:number):string{
  const gift=REGIONS.find(r=>r.gift===id);if(gift)return gift.name+'道馆赠礼';
  const evo=evolutions.find(e=>e.to===id),npcGift=NPC_GIFTS.find(g=>g.speciesId===id);
  if(evo)return pokemon(evo.from).name+'达到 Lv.'+evo.level+' 后进化'+(npcGift?'；也可在 '+npcGift.badges+' 枚徽章后领取家人的收藏赠礼':'');
  return REGIONS.find(r=>encountersFor(r.id).includes(id))?.name+'的草丛';
}
