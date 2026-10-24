import {describe,it,expect} from 'vitest';
import {catalog} from '../src/game/catalog';
import {DEX_GENERATIONS,DEX_DISPLAY,dexCatalog,dexEntry,dexMatchRank,dexNumber,dexPresentation,dexSuggestions,filterDex,toggleDexType,normalizeDexQuery} from '../src/game/pokedex';
import {TYPE_NAMES} from '../content/world';

describe('National Pokédex preview',()=>{
 it('covers every national species exactly once with complete localized metadata',()=>{
  expect(dexCatalog.map(p=>p.id)).toEqual(Array.from({length:1025},(_,i)=>i+1));
  expect(DEX_GENERATIONS.map(g=>dexCatalog.filter(p=>p.generation===g.id).length)).toEqual([151,100,135,107,156,72,88,96,120]);
  for(const p of dexCatalog){expect(p.name).toMatch(/[\u3400-\u9fff]/);expect(p.english.length).toBeGreaterThan(0);expect(p.types.length).toBeGreaterThan(0);expect(p.types.length).toBeLessThanOrEqual(2);expect(p.types.every(t=>t in TYPE_NAMES)).toBe(true);}
  expect(dexEntry(905)?.generation).toBe('gen8');expect(dexEntry(1025)?.name).toBe('桃歹郎');
 });
 it('preserves gameplay identity and reveals artwork only through explicit presentation capabilities',()=>{
  expect(catalog).toHaveLength(151);expect(DEX_DISPLAY.activeGeneration).toBe('gen1');
  for(const original of catalog){const p=dexEntry(original.id)!;expect(p.name).toBe(original.name);expect(p.types).toEqual(original.types);expect(dexPresentation(p).artwork).toBe('assets/pokemon/art/'+p.id+'.png');}
  for(const p of dexCatalog.filter(e=>e.id>151))expect(dexPresentation(p)).toEqual({available:false,artwork:null});
  expect(dexPresentation(dexEntry(152)!,{activeGeneration:'gen2',artworkGenerations:['gen1','gen2']}).artwork).toBe('assets/pokemon/art/152.png');
  expect(dexPresentation(dexEntry(252)!,{activeGeneration:'gen2',artworkGenerations:['gen1','gen2']}).available).toBe(false);
 });
 it.each(['皮卡','Pikachu','PIKA','pikaqiu','pkq','kaqiu','25','025','#025','＃０２５'])('finds Pikachu using %s',query=>{
  expect(dexSuggestions(query).map(p=>p.id)).toContain(25);
 });
 it('normalizes punctuation, handles special names and reviewed polyphonic names',()=>{
  expect(dexSuggestions('mr mime')[0].id).toBe(122);
  expect(dexSuggestions('farfetchd')[0].id).toBe(83);
  expect(dexSuggestions('Type: Null')[0].id).toBe(772);
  expect(dexSuggestions('nidoran-f')[0].id).toBe(29);
  expect(dexSuggestions('nidoran-m')[0].id).toBe(32);
  expect(dexSuggestions('changchiou')[0].id).toBe(278);
  expect(dexSuggestions('maoyoutanzhang')[0].id).toBe(735);
  expect(dexSuggestions('1025')[0].id).toBe(1025);
  expect(dexNumber(25)).toBe('#025');expect(dexNumber(1025)).toBe('#1025');
  expect(normalizeDexQuery('  Mr. Mime  ')).toBe('mrmime');
 });
 it('orders exact matches before prefixes and substrings; bounds global suggestions',()=>{
  expect(dexSuggestions('mew').map(p=>p.id)).toEqual([151,150]);
  expect(dexMatchRank(dexEntry(25)!,'pikachu')).toBe(0);expect(dexMatchRank(dexEntry(25)!,'pika')).toBe(1);expect(dexMatchRank(dexEntry(25)!,'kachu')).toBe(2);
  expect(dexSuggestions('a')).toHaveLength(8);
  expect(dexSuggestions('  ')).toEqual([]);expect(dexSuggestions('not-a-pokemon')).toEqual([]);expect(dexSuggestions('0')).toEqual([]);expect(dexSuggestions('1026')).toEqual([]);
 });
 it('keeps the latest two selected types and matches their intersection',()=>{
  expect(toggleDexType(['fire','flying'],'water')).toEqual(['flying','water']);
  expect(toggleDexType(['fire','flying'],'fire')).toEqual(['flying']);
  const results=filterDex({generation:'gen1',types:['fire','flying'],status:'all',query:''},{seen:[],caught:[]});
  expect(results.map(p=>p.id)).toEqual([6,146]);
  expect(filterDex({generation:'gen1',types:['fire','water'],status:'all',query:''},{seen:[],caught:[]})).toEqual([]);
 });
 it('intersects generation, type, status and query without mutating saved progress',()=>{
  const state={seen:[1,4,6,25],caught:[1,6,25]},before=structuredClone(state);
  expect(filterDex({generation:'gen1',types:['fire'],status:'caught',query:''},state).map(p=>p.id)).toEqual([6]);
  expect(filterDex({generation:'gen1',types:['flying'],status:'caught',query:'喷'},state).map(p=>p.id)).toEqual([6]);
  expect(filterDex({generation:'gen9',types:[],status:'seen',query:''},state)).toEqual([]);
  expect(filterDex({generation:'gen1',types:[],status:'all',query:'xinyemiao'},state)).toEqual([]);
  expect(dexSuggestions('xinyemiao')[0].id).toBe(906);
  expect(filterDex({generation:'all',types:[],status:'all',query:''},state)).toHaveLength(1025);
  expect(state).toEqual(before);
 });
});
