import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { initialState, publicState,dayOf, rollover,grant,makePartner } from '../server/state';
import { execute } from '../server/engine';
import { SPECIES,EVOLUTIONS,WORDS,wildPool,captureChance,damage,wordBank,wordsFor,sameLineage } from '../server/game-data';
import { REGIONS } from '../content/world';
import {NPC_GIFTS} from '../content/packs';
import {recordFirst,makeQuestion} from '../server/quiz';
import type { GameState,Role } from '../src/game/types';
const rt={now:new Date('2026-10-18T10:00:00Z'),uuid:randomUUID,random:()=>0.3};
function act(s:GameState,type:string,payload:Record<string,unknown>={},role:Role='child',time=rt){return execute(s,{type,payload,operationId:randomUUID()},role,time);}
function started(){return act(initialState([],rt.now),'starter',{speciesId:25}).state;}
function solve(s:GameState,correct=true){const q=s.question!;return act(s,'answer',{questionId:q.id,optionId:correct?q.correctOptionId:q.options.find(o=>o.id!==q.correctOptionId)!.id});}
describe('content coverage',()=>{
 it('uses released evolution data for lineage, not future-generation shared ancestors',()=>{expect(sameLineage(106,107)).toBe(false);expect(sameLineage(1,3)).toBe(true);expect(sameLineage(25,26)).toBe(true);});
 it('contains 151 species and 300 distinct words',()=>{expect(SPECIES).toHaveLength(151);expect(WORDS).toHaveLength(300);expect(new Set(WORDS.map(w=>w.word.toLowerCase())).size).toBe(300);expect(SPECIES.every(p=>/[\u3400-\u9fff]/.test(p.name))).toBe(true);});
 it('every species is reachable by encounter, gift or evolution before level 50',()=>{
   const reachable=new Set([...REGIONS.flatMap(r=>wildPool(r.id).map(p=>p.id)),...REGIONS.map(r=>r.gift),1,4,7,25]);
   for(let i=0;i<5;i++)for(const e of EVOLUTIONS)if(reachable.has(e.from)&&e.level<=50)reachable.add(e.to);
   expect(SPECIES.filter(p=>!reachable.has(p.id))).toEqual([]);
 });
});
describe('questions and rewards',()=>{
 it('does not offer two valid translations for the same Chinese meaning',()=>{
   const s=started();s.disabledWordIds=WORDS.map(w=>w.id);s.customWords=[
     {id:'h1',word:'home',meaning:'家',topic:'测试',level:1,example:'My home.'},
     {id:'h2',word:'house',meaning:'家',topic:'测试',level:1,example:'My house.'},
     ...['cat','dog','apple','pen','blue'].map((word,i)=>({id:'other'+i,word,meaning:['猫','狗','苹果','钢笔','蓝色'][i],topic:'测试',level:1,example:word})),
   ];
   for(let i=0;i<40;i++){const q=makeQuestion(s,'daily',{...rt,random:()=>((i*31+7)%97)/97});if(q.prompt.includes('“家”'))expect(q.options.filter(o=>['home','house'].includes(o.text))).toHaveLength(1);}
 });
 it('schedules reviews on calendar days 1, 3 and 7 without skipping after early repetition',()=>{
   const s=act(started(),'practice.start').state,q=s.question!;
   recordFirst(s,q,false,rt);recordFirst(s,q,true,rt);expect(s.mastery[q.wordId].due).toBe('2026-10-19');
   recordFirst(s,q,true,rt);expect(s.mastery[q.wordId].due).toBe('2026-10-19');
   recordFirst(s,q,true,{...rt,now:new Date('2026-10-19T10:00:00Z')});expect(s.mastery[q.wordId].due).toBe('2026-10-21');
   recordFirst(s,q,true,{...rt,now:new Date('2026-10-21T10:00:00Z')});expect(s.mastery[q.wordId].due).toBe('2026-10-25');
 });
 it('requires correction and grants no damage bonus after a wrong first attempt',()=>{
   let s=act(started(),'encounter').state;s=act(s,'battle.move',{moveId:s.partners[0].moves[0]}).state;
   const before=s.battle!.enemyHp,questionId=s.question!.id;
   const failed=solve(s,false);expect(failed.result.effect).toBe('wrong');expect(failed.state.battle!.enemyHp).toBe(before);expect(failed.state.question!.id).toBe(questionId);
   expect(()=>act(failed.state,'battle.leave')).toThrow('先完成');
   const move=failed.state.question!.moveId!,b=failed.state.battle!,p=failed.state.partners[0];
   const expected=damage(p.speciesId,p.level,b.enemy,b.enemyLevel,move,1);
   const corrected=solve(failed.state);expect(corrected.state.question).toBeNull();expect(corrected.state.battle!.enemyHp).toBe(Math.max(0,before-expected));expect(corrected.state.battle!.combo).toBe(0);
 });
 it('never exposes the answer key and reveals teaching material only after a mistake',()=>{
   let s=act(started(),'practice.start').state;const first=publicState(s,'child',0,rt.now);
   expect(first.question).not.toHaveProperty('correctOptionId');expect(first.question).not.toHaveProperty('explanation');expect(first).not.toHaveProperty('words');
   s=solve(s,false).state;expect(publicState(s,'child',1,rt.now).question?.explanation).toBeTruthy();
 });
 it('counts only first attempts and limits daily practice to ten questions',()=>{
   let s=started();for(let i=0;i<10;i++){s=act(s,'practice.start').state;if(i===0)s=solve(s,false).state;s=solve(s).state;}
   expect(s.daily.correct).toBe(9);expect(s.daily.questions).toBe(10);expect(()=>act(s,'practice.start')).toThrow('已完成');
 });
 it('does not accept forged answers or nonexistent options',()=>{
   const s=act(started(),'practice.start').state;
   expect(()=>act(s,'answer',{questionId:randomUUID(),optionId:s.question!.correctOptionId})).toThrow('已更新');
   expect(()=>act(s,'answer',{questionId:s.question!.id,optionId:'fake'})).toThrow('选项');
 });
 it('applies approval once and respects the shared cap and carry',()=>{
   let s=started();s.daily.correct=10;s=act(s,'checkin.submit',{taskIds:['english']}).state;s.daily.expGranted=300;
   const reviewed=act(s,'parent.review',{date:s.daily.date,approve:true},'parent');
   expect(reviewed.state.daily.expGranted).toBe(320);expect(reviewed.state.carry).toBe(256);
   expect(()=>act(reviewed.state,'parent.review',{date:s.daily.date,approve:true},'parent')).toThrow('已处理');
   const after=reviewed.state;rollover(after,{...rt,now:new Date('2026-10-19T00:00:00Z')});expect(after.daily.expGranted).toBe(256);expect(after.carry).toBe(0);
   rollover(after,{...rt,now:new Date('2026-10-19T01:00:00Z')});expect(after.daily.expGranted).toBe(256);
 });
 it('uses Shanghai date at the UTC day boundary',()=>{expect(dayOf(new Date('2026-10-18T17:00:00Z'))).toBe('2026-10-19');});
 it('preserves an unfinished daily correction across midnight as review',()=>{
   let s=act(started(),'practice.start').state;s=solve(s,false).state;const id=s.question!.id;
   rollover(s,{...rt,now:new Date('2026-10-18T16:01:00Z')});
   expect(s.question?.id).toBe(id);expect(s.question?.wrong).toBe(true);expect(s.question?.kind).toBe('review');expect(s.daily.questions).toBe(0);
 });
 it('blocks a child from parent operations',()=>{expect(()=>act(started(),'parent.settings',{dailyCap:5000})).toThrow('家长');});
});
describe('adventure state',()=>{
 it('keeps battle/question state across serialization and rejects locked regions',()=>{
   let s=act(started(),'encounter').state;s=act(s,'battle.move',{moveId:s.partners[0].moves[0]}).state;
   const restored=JSON.parse(JSON.stringify(s)) as GameState;expect(restored.battle).toEqual(s.battle);expect(solve(restored).state.question).toBeNull();
   expect(()=>act(started(),'world.position',{regionId:REGIONS[3].id,x:12,y:16})).toThrow('上一座');
 });
 it('charges one encounter and stops at the daily quota',()=>{
   let s=started();for(let i=0;i<3;i++){s=act(s,'encounter').state;expect(s.daily.encounters).toBe(i+1);s=act(s,'battle.leave').state;}
   expect(()=>act(s,'encounter')).toThrow('已完成');
 });
 it('blocks weekday starts and allows a dated parent override',()=>{
   const monday={...rt,now:new Date('2026-10-19T10:00:00Z')};
   expect(()=>act(started(),'encounter',{},'child',monday)).toThrow('周末');
   let s=act(started(),'parent.settings',{weekdayPassDate:true},'parent',monday).state;
   s=act(s,'encounter',{},'child',monday).state;expect(s.battle?.status).toBe('active');
 });
 it('capture boost is bounded and depends on remaining HP',()=>{
   expect(captureChance(10,1,100,0.15)).toBeLessThanOrEqual(0.95);
   expect(captureChance(10,1,100,0)).toBeGreaterThan(captureChance(10,100,100,0));
 });
 it('distributes integer experience without minting extra points',()=>{
   const s=started();const before=s.partners[0].exp;expect(grant(s,5)).toBe(5);expect(s.partners[0].exp-before).toBe(5);
 });
 it('keeps overflow experience assigned to its original partner',()=>{
   const s=started(),second=makePartner(4,5,rt);s.partners.push(second);s.daily.expGranted=319;
   const before=s.partners.map(p=>p.exp);grant(s,100,[s.partners[0].id]);grant(s,50,[second.id]);
   rollover(s,{...rt,now:new Date('2026-10-19T03:00:00Z')});
   expect(s.partners[0].exp-before[0]).toBe(100);expect(s.partners[1].exp-before[1]).toBe(50);expect(s.carry).toBe(0);
 });
 it('edits a word without duplicating its ID and can re-enable paused words',()=>{
   let s=started();const w=WORDS[0];
   s=act(s,'parent.words',{words:[{...w,word:'reddish',meaning:'微红的'}]},'parent').state;
   expect(wordBank(s).filter(x=>x.id===w.id)).toHaveLength(1);
   s=act(s,'parent.word.disable',{wordId:w.id},'parent').state;
   expect(wordsFor(s).some(x=>x.id===w.id)).toBe(false);
   expect(publicState(s,'parent',0,rt.now).words?.find(x=>x.id===w.id)?.active).toBe(false);
   s=act(s,'parent.word.disable',{wordId:w.id,disabled:false},'parent').state;
   expect(wordsFor(s).some(x=>x.id===w.id)).toBe(true);
 });
 it('makes all Eevee branches obtainable even with same-family duplicate capture conversion',()=>{
   let s=started();s.badges=REGIONS.map(r=>r.id);
   s.npcs=NPC_GIFTS.map(g=>({id:g.npcId,name:'家人',regionId:'home-meadow',x:12,y:16,kind:'family',line:'加油',quest:'收藏挑战'}));
   for(const gift of NPC_GIFTS){
     s=act(s,'npc.challenge',{npcId:gift.npcId}).state;s=solve(s).state;
     expect(s.partners.some(p=>p.speciesId===gift.speciesId)).toBe(true);
     const count=s.partners.length;s=act(s,'npc.challenge',{npcId:gift.npcId}).state;s=solve(s).state;expect(s.partners.length).toBe(count);
   }
 });
});
