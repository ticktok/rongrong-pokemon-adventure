import type {BattleEvent,BattleFrame,GameState} from '../src/game/types';
import {MOVES,effectiveness} from '../content/world';
import {species} from './game-data';

export function battleFrame(state:GameState):BattleFrame{
  const battle=state.battle!;
  const partner=state.partners.find(p=>p.id===battle.playerId)!;
  return {battle:structuredClone(battle),playerSpecies:partner.speciesId,playerLevel:partner.level};
}
export function attackEvent(events:BattleEvent[],before:BattleFrame,state:GameState,side:'own'|'enemy',moveId:string,bonus=1){
  const after=battleFrame(state),move=MOVES.find(m=>m.id===moveId)!;
  const target=side==='own'?before.battle.enemy:before.playerSpecies;
  events.push({kind:'attack',side,moveId,bonus,effectiveness:effectiveness(move.type,species(target).types),
    damage:side==='own'?before.battle.enemyHp-after.battle.enemyHp:before.battle.playerHp-after.battle.playerHp,before,after});
}
export function stageEvent(events:BattleEvent[],before:BattleFrame,state:GameState,kind:'faint'|'sendout'|'outcome'|'capture',side:'own'|'enemy',message:string){
  events.push({kind,side,message,before,after:battleFrame(state)});
}
