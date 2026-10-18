import species from './gen1/species.json';
import evolutions from './gen1/evolutions.json';
import regions from './gen1/regions.json';
import encounters from './gen1/encounters.json';
import type {Species,Evolution,Region} from '../src/game/types';
export interface GenerationPack {
  id:string;name:string;version:number;ruleset:string;starterIds:number[];
  species:Species[];evolutions:Evolution[];regions:Region[];encounters:Record<string,number[]>;
  npcGifts:{npcId:string;speciesId:number;badges:number;level:number}[];
}
// New generations append a pack here. Existing national IDs, region IDs and encounter pools stay unchanged.
export const PACKS:GenerationPack[]=[{id:'gen1',name:'关都篇',version:1,ruleset:'family-v1',starterIds:[1,4,7,25],species:species as Species[],evolutions,regions,encounters,npcGifts:[{npcId:'family-mum',speciesId:134,badges:4,level:18},{npcId:'family-grandpa',speciesId:135,badges:6,level:25},{npcId:'family-nana',speciesId:136,badges:8,level:35}]}];
export const REGIONS=PACKS.flatMap(pack=>pack.regions);
export const ALL_SPECIES=PACKS.flatMap(pack=>pack.species);
export const ALL_EVOLUTIONS=PACKS.flatMap(pack=>pack.evolutions);
export const STARTERS=PACKS[0].starterIds;
export const NPC_GIFTS=PACKS.flatMap(pack=>pack.npcGifts);
export function encountersFor(regionId:string):number[]{return PACKS.find(pack=>Object.hasOwn(pack.encounters,regionId))?.encounters[regionId]??[];}
