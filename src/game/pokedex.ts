import entries from '../../content/pokedex/species.json';
import {catalog} from './catalog';
import type {PublicState} from './types';

export type GenerationId=`gen${number}`;
export interface DexEntry {id:number;name:string;english:string;generation:GenerationId;types:string[];aliases:string[]}
export interface DexGeneration {id:GenerationId;label:string;region:string}
export const DEX_GENERATIONS:readonly DexGeneration[]=[
 {id:'gen1',label:'第一世代·红绿',region:'关都'},
 {id:'gen2',label:'第二世代·金银',region:'城都'},
 {id:'gen3',label:'第三世代·红宝石／蓝宝石',region:'丰缘'},
 {id:'gen4',label:'第四世代·钻石／珍珠',region:'神奥'},
 {id:'gen5',label:'第五世代·黑白',region:'合众'},
 {id:'gen6',label:'第六世代·X／Y',region:'卡洛斯'},
 {id:'gen7',label:'第七世代·太阳／月亮',region:'阿罗拉'},
 {id:'gen8',label:'第八世代·剑盾',region:'伽勒尔'},
 {id:'gen9',label:'第九世代·朱紫',region:'帕底亚'},
];
// Display capabilities are independent of both the selected tab and gameplay packs.
// A future release can add local artwork and register its generation here.
export interface DexDisplayConfig {activeGeneration:GenerationId;artworkGenerations:readonly GenerationId[]}
export const DEX_DISPLAY:DexDisplayConfig={activeGeneration:'gen1',artworkGenerations:['gen1']};
export const dexCatalog:readonly DexEntry[]=entries.map(e=>{
 const playable=catalog.find(p=>p.id===e.id);
 return {...e,generation:e.generation as GenerationId,...(playable?{name:playable.name,types:playable.types}:{} )};
});
const byId=new Map(dexCatalog.map(entry=>[entry.id,entry]));
export const dexEntry=(id:number)=>byId.get(id);
export const dexNumber=(id:number)=>'#'+String(id).padStart(3,'0');
export const generationLabel=(id:GenerationId)=>DEX_GENERATIONS.find(g=>g.id===id)?.label??id;
export function dexPresentation(entry:DexEntry,config:DexDisplayConfig=DEX_DISPLAY){
 const available=config.artworkGenerations.includes(entry.generation);
 return {available,artwork:available?'assets/pokemon/art/'+entry.id+'.png':null};
}
export function normalizeDexQuery(value:string){
 return value.normalize('NFKC').toLowerCase().replace(/ü/g,'v').replace(/[\s\p{P}]/gu,'');
}
const searchIndex=new Map(dexCatalog.map(e=>[e.id,[...new Set([e.name,...e.aliases,e.english].map(normalizeDexQuery))]]));
export function dexMatchRank(entry:DexEntry,query:string):number{
 const q=normalizeDexQuery(query);if(!q)return 0;
 if(/^\d+$/.test(q))return Number(q)===entry.id?0:Infinity;
 const names=searchIndex.get(entry.id)??[entry.name,entry.english,...entry.aliases].map(normalizeDexQuery);
 if(names.some(n=>n===q))return 0;
 if(names.some(n=>n.startsWith(q)))return 1;
 return names.some(n=>n.includes(q))?2:Infinity;
}
export function dexSuggestions(query:string,limit=8):DexEntry[]{
 if(!normalizeDexQuery(query))return [];
 return dexCatalog.map(entry=>({entry,rank:dexMatchRank(entry,query)})).filter(x=>Number.isFinite(x.rank)).sort((a,b)=>a.rank-b.rank||a.entry.id-b.entry.id).slice(0,limit).map(x=>x.entry);
}
export type DexStatus='all'|'seen'|'caught';
export interface DexFilters {generation:GenerationId|'all';type:string;status:DexStatus;query:string}
export function matchesDexStatus(entry:DexEntry,status:DexStatus,state:Pick<PublicState,'seen'|'caught'>){
 return status==='all'||state[status].includes(entry.id);
}
export function filterDex(filters:DexFilters,state:Pick<PublicState,'seen'|'caught'>):DexEntry[]{
 return dexCatalog.filter(e=>(filters.generation==='all'||e.generation===filters.generation)&&(!filters.type||e.types.includes(filters.type))&&matchesDexStatus(e,filters.status,state)&&Number.isFinite(dexMatchRank(e,filters.query)));
}
