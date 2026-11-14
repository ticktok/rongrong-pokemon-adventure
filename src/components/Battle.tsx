import {ArrowLeft,BookOpen,Sparkles,Target} from 'lucide-react';
import {REGIONS,MOVES,effectiveness} from '../../content/world';
import {pokemon} from '../game/catalog';
import type {PublicState} from '../game/types';
import {asset,type Run} from '../lib';
import BattleFx from './BattleFx';
import {useBattlePlayback,type Playback} from './useBattlePlayback';
import {MOVE_VISUALS} from '../game/move-effects';
import './Battle.css';
import {TypeIcon} from './TypeIcon';
export default function Battle({state,run,busy,playback,reduced,sound,onPlaybackDone}:{state:PublicState;run:Run;busy:boolean;playback:Playback|null;reduced:boolean;sound:boolean;onPlaybackDone:()=>void}){
  const step=useBattlePlayback(playback,reduced,sound,onPlaybackDone);
  const b=step?.frame.battle??state.battle!,p=state.partners.find(p=>p.id===b.playerId)!,enemy=pokemon(b.enemy),own=pokemon(step?.frame.playerSpecies??p.speciesId),ownLevel=step?.frame.playerLevel??p.level,r=REGIONS.find(r=>r.id===b.regionId)!;
  const event=step?.event,attack=event?.kind==='attack'?event:null,move=attack?MOVES.find(m=>m.id===attack.moveId):null;
  const acting=attack&&!step?.impact?attack.side:null,hit=attack&&step?.impact&&attack.damage>0?(attack.side==='own'?'enemy':'own'):null;
  const physical=attack&&MOVE_VISUALS[attack.moveId]?.physical;
  const done=b.status!=='active',locked=busy||!!playback||!!state.question;
  const caption=attack?pokemon(attack.side==='own'?attack.before.playerSpecies:attack.before.battle.enemy).name+' · '+move?.name:event?.kind!=='attack'?event?.message:'';
  return <section className={'battle-panel '+(b.status==='caught'?'capture-success':'')}>
    <div className="battle-top"><button className="text-button" disabled={locked} onClick={()=>run('battle.leave')}><ArrowLeft size={17}/>{done?'回到地图':'结束本次冒险'}</button>{playback?<button className="skip-battle" onClick={onPlaybackDone}>跳过动画</button>:<span>{b.kind==='gym'?r.leader+'的道馆':'野外相遇'} · 第 {b.turn} 回合</span>}</div>
    <div className={'battle-stage biome-'+r.biome}>
      <div className="battle-cloud cloud-a"/><div className="battle-cloud cloud-b"/>
      <div className="fighter-info enemy-info"><div><b>{enemy.name}</b><span>Lv.{b.enemyLevel}</span></div><div className="hp-line"><small>HP</small><i><span style={{width:100*b.enemyHp/b.enemyMaxHp+'%'}}/></i></div><small>{b.enemyHp} / {b.enemyMaxHp}</small></div>
      <div className="battle-platform enemy-platform"/><img className={'enemy-sprite '+(b.enemyHp===0?'fainted ':'')+(acting==='enemy'?(physical?'move-lunge ':'move-charge '):'')+(hit==='enemy'?'move-hit ':'')} src={asset('front',b.enemy)} alt={enemy.name}/>
      <div className="battle-platform own-platform"/><img className={'own-sprite '+(b.playerHp===0?'fainted ':'')+(acting==='own'?(physical?'move-lunge ':'move-charge '):'')+(hit==='own'?'move-hit ':'')} src={asset('back',own.id)} alt={own.name+'背影'}/>
      <div className="fighter-info own-info"><div><b>{own.name}</b><span>Lv.{ownLevel}</span></div><div className="hp-line"><small>HP</small><i><span style={{width:100*b.playerHp/b.playerMaxHp+'%'}}/></i></div><small>{b.playerHp} / {b.playerMaxHp}</small></div>
      <BattleFx event={event??null} reduced={reduced}/>
      {caption&&<div className={'move-caption '+(move?'type-'+move.type:'')} role="status">{move&&<TypeIcon type={move.type}/>}<strong>{caption}</strong>{attack&&attack.bonus>1&&<small>英语助攻</small>}</div>}
      {attack&&step?.impact&&<div key={step.id+'-'+step.index} className={'damage-number damage-'+(attack.side==='own'?'enemy':'own')}><b>{attack.damage>0?'−'+attack.damage:'无效'}</b>{attack.effectiveness>1&&<small>效果拔群！</small>}{attack.effectiveness>0&&attack.effectiveness<1&&<small>效果较弱</small>}</div>}
      <div className="battle-spark"><Sparkles size={15}/>英语助攻 · 连对 {b.combo}/3</div>
      {b.status==='caught'&&<div className="catch-overlay"><div className="pokeball animated-ball"/><h2>成为伙伴啦！</h2></div>}
      {b.status==='won'&&<div className="win-ribbon">挑战成功！</div>}
    </div>
    <div className="battle-console"><div className="battle-log" aria-live="polite">{b.log.slice(-2).map((line,i)=><p key={b.turn+'-'+i}>{line}</p>)}</div>
      {done?<button className="primary" disabled={locked} onClick={()=>run('battle.leave')}>带着这份勇气，继续出发<ArrowLeft className="reverse" size={18}/></button>:<>
        <div className="move-grid">{p.moves.map(id=>{const move=MOVES.find(m=>m.id===id)!,factor=effectiveness(move.type,enemy.types);return <button key={id} className={'move-button type-'+move.type} disabled={locked} onClick={()=>run('battle.move',{moveId:id})}><TypeIcon type={move.type}/><strong>{move.name}</strong><small>{factor===0?'无效':factor>1?'效果拔群 ×'+factor:factor<1?'效果较弱':'威力 '+move.power}<BookOpen size={14}/></small></button>;})}</div>
        <div className="battle-actions"><div className="switch-team">{state.team.map(id=>{const partner=state.partners.find(p=>p.id===id)!;return <button title={'换上'+pokemon(partner.speciesId).name} key={id} disabled={locked||id===b.playerId||(b.teamHp[id]??0)<=0} onClick={()=>run('battle.switch',{partnerId:id})}><img src={asset('front',partner.speciesId)} alt={pokemon(partner.speciesId).name}/><span>{b.teamHp[id]??0} HP</span></button>;})}</div>{b.kind==='wild'&&<button className="capture-button" disabled={locked} onClick={()=>run('battle.catch')}><Target size={23}/><span>抛出精灵球<small>剩余 {3-b.balls} 球 · 答词助攻</small></span></button>}</div>
      </>}
    </div>
  </section>;
}
