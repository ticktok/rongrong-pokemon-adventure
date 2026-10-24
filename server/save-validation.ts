import {z} from 'zod';
import {PACKS} from '../content/packs';
import {MOVES} from '../content/world';
import words from '../content/words.json';
import type {GameState} from '../src/game/types';

const id=z.string().min(1),count=z.number().int().nonnegative(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ids=z.array(id),numbers=z.array(z.number().int().positive());
const checkinReview=z.object({
  tasks:z.array(z.object({id,name:id,status:z.enum(['unsubmitted','pending','approved','rejected']),submittedAt:id.optional(),reviewedAt:id.optional(),reason:z.string().optional()}).passthrough()).min(1).max(20),
  rules:z.object({baseExp:count,fastMultiplier:z.number().min(1).max(2),fastDeadline:id,englishPerQuestion:z.number().nonnegative(),streakBonus:count}).passthrough(),
  submissionVersion:count,settled:count,streakReward:count,
}).passthrough();
const word=z.object({id,word:id,meaning:id,topic:id,level:z.number().int().positive(),example:z.string(),active:z.boolean().optional()}).passthrough();
const question=z.object({id,wordId:id,prompt:id,options:z.array(z.object({id,text:id}).passthrough()).min(2),correctOptionId:id,wrong:z.boolean(),firstCorrect:z.boolean().optional(),kind:z.enum(['daily','review','battle','catch','npc']),explanation:z.string(),word:id,example:z.string(),moveId:id.optional(),npcId:id.optional()}).passthrough();
// passthrough preserves future additive fields when a backup is restored.
export const saveSchema:z.ZodType<GameState>=z.object({
  schemaVersion:z.literal(1),nickname:id,realName:z.string(),started:z.boolean(),
  partners:z.array(z.object({id,speciesId:z.number().int().positive(),exp:count,level:z.number().int().min(1).max(50),moves:ids.min(1).max(4),sealed:count.optional(),sealCountedDates:z.array(day).optional(),acquiredAt:day}).passthrough()),
  team:ids.max(3),seen:numbers,caught:numbers,badges:ids,
  position:z.object({regionId:id,x:z.number().int(),y:z.number().int()}).passthrough(),
  battle:z.object({id,kind:z.enum(['wild','gym']),regionId:id,enemy:z.number().int().positive(),enemyLevel:count,enemyHp:count,enemyMaxHp:count,playerId:id,playerHp:count,playerMaxHp:count,teamHp:z.record(id,count),enemyIndex:count,enemies:numbers,combo:count,balls:count,turn:count,log:z.array(z.string()),status:z.enum(['active','won','lost','caught','fled'])}).passthrough().nullable(),
  question:question.nullable(),
  daily:z.object({date:day,questions:count,correct:count,completedIds:ids,encounters:count,expGranted:count,practiceFinished:z.boolean(),goal:count.optional()}).passthrough(),
  checkins:z.array(z.object({date:day,taskIds:ids,status:z.enum(['pending','partial','approved','rejected']),submittedAt:id,englishCorrect:count,granted:count,reason:z.string().optional(),reviewedAt:id.optional(),review:checkinReview.optional()}).passthrough()),
  mastery:z.record(id,z.object({correct:count,wrong:count,due:day,stage:count,reviewStarted:day.optional()}).passthrough()),
  carry:count,carryTargets:ids,carryByPartner:z.record(id,count).optional(),unallocatedExp:count.optional(),streakRewardsSettled:count.optional(),
  settings:z.object({baseExp:count,dailyCap:count,captureLimit:count,attackBonus:z.number().nonnegative(),comboBonus:z.number().nonnegative(),catchBonus:z.number().nonnegative(),fastMultiplier:z.number().nonnegative(),fastDeadline:id,streakBonus:count,englishPerQuestion:z.number().nonnegative(),sealDays:count,maxWordLevel:count,weekdayPassDate:z.string(),tasks:z.array(z.object({id,name:id,active:z.boolean()}).passthrough())}).passthrough(),
  npcs:z.array(z.object({id,name:id,regionId:id,x:z.number().int(),y:z.number().int(),kind:z.enum(['family','classmate']),line:z.string(),quest:z.string()}).passthrough()),
  customWords:z.array(word),disabledWordIds:ids,npcCompleted:ids,events:z.array(z.object({date:id,message:z.string()}).passthrough()),
}).passthrough();

export function contentIdentity(){
  unique(PACKS.flatMap(p=>p.species.map(s=>s.id)),'content species IDs');
  unique(PACKS.flatMap(p=>p.regions.map(r=>r.id)),'content region IDs');
  unique(words.map(w=>w.id),'content word IDs');unique(MOVES.map(m=>m.id),'content move IDs');
  return {
    species:Object.fromEntries(PACKS.flatMap(p=>p.species.map(s=>[s.id,p.id+':'+s.english]))),
    regions:Object.fromEntries(PACKS.flatMap(p=>p.regions.map(r=>[r.id,p.id+':'+r.name]))),
    words:Object.fromEntries(words.map(w=>[w.id,w.word.toLowerCase()])),
    moves:Object.fromEntries(MOVES.map(m=>[m.id,m.type+':'+m.name])),
  };
}
export type ContentIdentity=ReturnType<typeof contentIdentity>;
export function compareContent(previous:ContentIdentity,current=contentIdentity()){
  const problems:string[]=[];
  for(const kind of ['species','regions','words','moves'] as const){
    for(const [key,value] of Object.entries(previous[kind]))if(current[kind][key]!==value)problems.push(`${kind}:${key} was removed or reassigned`);
  }
  return problems;
}
function unique(values:readonly (string|number)[],name:string){if(new Set(values).size!==values.length)throw new Error('Duplicate '+name);}
export function validateSave(value:unknown,content=contentIdentity()):GameState{
  const parsed=saveSchema.safeParse(value);
  if(!parsed.success)throw new Error('Invalid save structure: '+parsed.error.issues.map(i=>i.path.join('.')).join(', '));
  const s=parsed.data,partners=new Set(s.partners.map(p=>p.id)),npcs=new Set(s.npcs.map(n=>n.id));
  const wordIds=new Set([...Object.keys(content.words),...s.customWords.map(w=>w.id)]);
  const requireRef=(ok:boolean,path:string)=>{if(!ok)throw new Error('Unresolved save reference: '+path);};
  const species=(n:number,path:string)=>requireRef(Object.hasOwn(content.species,n),path);
  const move=(n:string,path:string)=>requireRef(Object.hasOwn(content.moves,n),path);
  const region=(n:string,path:string)=>requireRef(Object.hasOwn(content.regions,n),path);
  unique(s.partners.map(p=>p.id),'partner IDs');unique(s.team,'team IDs');unique(s.npcs.map(n=>n.id),'NPC IDs');unique(s.customWords.map(w=>w.id),'custom word IDs');
  unique(s.checkins.map(c=>c.date),'checkin dates');
  for(const c of s.checkins){
    unique(c.taskIds,'submitted task IDs');
    if(!c.review){requireRef(c.status!=='partial','partial checkin tasks');continue;}
    const tasks=c.review.tasks;unique(tasks.map(t=>t.id),'checkin task IDs');
    c.taskIds.forEach(id=>requireRef(tasks.some(t=>t.id===id),'checkin task'));
    const status=tasks.some(t=>t.status==='pending')?'pending':tasks.every(t=>t.status==='approved')?'approved':tasks.some(t=>t.status==='approved')?'partial':'rejected';
    requireRef(c.status===status,'checkin status');
  }
  for(const p of s.partners){species(p.speciesId,'partners.speciesId');unique(p.moves,'equipped moves');p.moves.forEach(m=>move(m,'partners.moves'));}
  for(const p of [...s.team,...s.carryTargets,...Object.keys(s.carryByPartner??{})])requireRef(partners.has(p),'partner ID');
  requireRef(!s.started||s.team.length>0,'started team');
  [...s.caught,...s.seen].forEach(n=>species(n,'Pokedex'));s.badges.forEach(n=>region(n,'badges'));region(s.position.regionId,'position');
  s.npcs.forEach(n=>region(n.regionId,'NPC region'));
  for(const n of s.npcCompleted)requireRef(npcs.has(n.slice(n.indexOf(':')+1)),'completed NPC');
  for(const w of [...Object.keys(s.mastery),...s.disabledWordIds,...s.daily.completedIds])requireRef(wordIds.has(w),'word ID');
  if(s.battle){const b=s.battle;region(b.regionId,'battle region');[b.enemy,...b.enemies].forEach(n=>species(n,'battle species'));for(const p of [b.playerId,...Object.keys(b.teamHp)])requireRef(partners.has(p),'battle partner');}
  if(s.question){const q=s.question;requireRef(wordIds.has(q.wordId),'question word');unique(q.options.map(o=>o.id),'question options');requireRef(q.options.some(o=>o.id===q.correctOptionId),'question answer');if(q.moveId)move(q.moveId,'question move');if(q.npcId)requireRef(npcs.has(q.npcId),'question NPC');if(q.kind==='battle'||q.kind==='catch')requireRef(s.battle!==null,'question battle');}
  return s;
}
