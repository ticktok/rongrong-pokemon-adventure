import {ALL_SPECIES,ALL_EVOLUTIONS,encountersFor} from '../content/packs';
import wordData from '../content/words.json';
import { REGIONS, MOVES, effectiveness } from '../content/world';
import type { Species, Evolution, Word, Partner, GameState } from '../src/game/types';
export const SPECIES:Species[] = ALL_SPECIES;
export const EVOLUTIONS:Evolution[] = ALL_EVOLUTIONS;
export const WORDS = wordData as Word[];
export function species(id:number):Species { const p=SPECIES.find(p=>p.id===id); if(!p)throw new Error('找不到这位宝可梦伙伴'); return p; }
export function region(id:string) { const r=REGIONS.find(r=>r.id===id); if(!r)throw new Error('还没有这张地图'); return r; }
export function levelFor(exp:number):number { return Math.min(50,Math.max(1,Math.floor(Math.sqrt(Math.max(0,exp)/10))+1)); }
export function expFor(level:number):number { return 10*(level-1)**2; }
export function hp(id:number, level:number):number { return Math.floor(species(id).stats.hp*0.6)+level*4+10; }
export function availableMoves(p:Partner) { const types=[...new Set(['normal',...species(p.speciesId).types])];return MOVES.filter(m=>types.includes(m.type)&&m.level<=p.level); }
export function defaultMoves(id:number,level:number):string[] {
  const types=species(id).types;
  return MOVES.filter(m=>(types.includes(m.type)||m.type==='normal')&&m.level<=level).sort((a,b)=>b.power-a.power).slice(0,4).map(m=>m.id);
}
export function damage(attacker:number,level:number,defender:number,defenderLevel:number,moveId:string,bonus=1):number {
  const move=MOVES.find(m=>m.id===moveId); if(!move)throw new Error('招式不存在');
  const a=species(attacker),d=species(defender),physical=['normal','fighting','flying','poison','ground','rock','bug','ghost','steel','dragon'].includes(move.type);
  const attack=a.stats[physical?'attack':'special-attack']+level*2;
  const defense=d.stats[physical?'defense':'special-defense']+defenderLevel*2;
  const type=effectiveness(move.type,d.types);
  if(type===0)return 0;
  return Math.max(1,Math.floor((((2*level/5+2)*move.power*attack/defense)/50+2)*(a.types.includes(move.type)?1.3:1)*type*bonus));
}
export function captureChance(id:number,currentHp:number,maxHp:number,bonus:number):number {
  const base=Math.max(0.08,Math.min(0.8,(species(id).captureRate/255)*(0.3+0.7*(1-currentHp/maxHp))));
  return Math.min(0.95,base+bonus);
}
export function wildPool(regionId:string):Species[] {
  return encountersFor(regionId).map(species);
}
export function sameLineage(a:number,b:number):boolean {
  const visited=new Set([a]),pending=[a];
  while(pending.length){const current=pending.shift()!;if(current===b)return true;
    for(const e of EVOLUTIONS){const next=e.from===current?e.to:e.to===current?e.from:undefined;if(next!==undefined&&!visited.has(next)){visited.add(next);pending.push(next);}}
  }
  return false;
}
export function wordBank(state:GameState):Word[] {
  const customNames=new Set(state.customWords.map(w=>w.word.toLowerCase()));
  const customIds=new Set(state.customWords.map(w=>w.id));
  return [...WORDS.filter(w=>!customNames.has(w.word.toLowerCase())&&!customIds.has(w.id)),...state.customWords];
}
export function wordsFor(state:GameState):Word[]{return wordBank(state).filter(w=>!state.disabledWordIds.includes(w.id)&&w.level<=state.settings.maxWordLevel);}

const ambiguousGroups=[
  ['look','see','watch'],['good','nice'],['home','house'],['hat','cap'],['coat','jacket'],['cup','glasses'],['blue','sad'],
  ['plane','airplane'],['gift','present'],['pants','trousers'],['sea','ocean'],['rock','stone'],['stream','river'],
  ['bag','backpack'],['bed','cot'],['chair','seat','bench'],['pot','pan'],['noodles','pasta'],['paint','draw'],
  ['cat','kitten'],['pig','piglet'],['duck','duckling'],['chicken','chick'],['sheep','lamb'],['cow','bull'],
  ...['cat','dog','bird','fish','rabbit','duck','chicken','cow','horse','sheep','pig','goat','mouse','lion','tiger','elephant','monkey','panda','bear','giraffe','zebra','snake','frog','turtle','butterfly','bull','goose','wolf','ostrich','dinosaur','insect','crocodile','beetle','parrot','bee','lamb','koala','whale','chick','piglet','kitten','duckling','hamster','peacock'].map(word=>['animal',word]),
  ...['bee','beetle','butterfly'].map(word=>['insect',word]),
  ...['chicken','chick','duck','duckling','goose','ostrich','parrot','peacock'].map(word=>['bird',word]),
];
export function questionDecoys(word:Word,words:Word[],reverse:boolean):Word[]{
  const related=new Set(ambiguousGroups.filter(group=>group.includes(word.word.toLowerCase())).flat());
  const values=new Set<string>();
  return words.filter(w=>{
    const value=reverse?w.word:w.meaning;
    if(w.id===word.id||w.meaning===word.meaning||related.has(w.word.toLowerCase())||value===(reverse?word.word:word.meaning)||values.has(value))return false;
    values.add(value);return true;
  });
}
export function questionWords(s:GameState):Word[]{
  const words=wordsFor(s);
  return words.filter(w=>questionDecoys(w,words,false).length>=3&&questionDecoys(w,words,true).length>=3);
}
export function dailyGoal(s:GameState,words=questionWords(s)):number{
  const remaining=words.filter(w=>!s.daily.completedIds.includes(w.id));
  const q=s.question;
  const held=q?.kind==='daily'&&!s.daily.completedIds.includes(q.wordId)&&!remaining.some(w=>w.id===q.wordId)?1:0;
  return Math.max(s.daily.questions,Math.min(s.daily.goal??10,s.daily.questions+remaining.length+held));
}
export function syncLearning(s:GameState){
  if(s.daily.goal!==undefined||s.daily.questions>0||s.question?.kind==='daily'){
    s.daily.goal=dailyGoal(s);s.daily.practiceFinished=s.daily.questions>=s.daily.goal;
  }
}
