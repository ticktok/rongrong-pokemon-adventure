import {useState} from 'react';
import {Check,Lock,ArrowUpRight,X,Heart,Star} from 'lucide-react';
import {TypeIcon,TypeIcons} from './TypeIcon';
import {pokemon,evolutions,portraitMoves} from '../game/catalog';
import {asset,type Run} from '../lib';
import type {Partner,PublicState} from '../game/types';
export function Team({state,run,busy}:{state:PublicState;run:Run;busy:boolean}){
  const [selected,setSelected]=useState<Partner|null>(null),[moves,setMoves]=useState<string[]>([]);
  const toggle=(id:string)=>{const team=state.team.includes(id)?state.team.filter(x=>x!==id):[...state.team,id];void run('team.update',{partnerIds:team});};
  return <section className="page-content"><div className="section-heading"><div><span className="eyebrow">OUR LITTLE TEAM</span><h1>一起长大的伙伴</h1><p>每一份认真，都在让你们变得更强。</p></div><span className="soft-tag"><Heart size={17}/>{state.partners.length} 位伙伴 · {state.team.length}/3 出战</span></div>
    {(state.claimableExp>0||state.carry>0)&&<section className="reward-balance"><div><h2>努力不会丢失</h2><p>{state.claimableExp>0?state.claimableExp+' 经验待分配，领取时受每日到账上限约束。':'顺延经验 '+state.carry+'，会在以后每天发给原来的伙伴。'}</p></div>{state.claimableExp>0&&<button className="primary" disabled={busy||!!state.question||state.battle?.status==='active'||!state.partners.some(p=>state.team.includes(p.id)&&!p.sealed&&p.level<50)} onClick={()=>run('reward.claim')}>领取到当前小队</button>}</section>}
    <div className="partner-grid">{state.partners.map(p=>{const info=pokemon(p.speciesId),possible=evolutions.filter(e=>e.from===p.speciesId&&p.level>=e.level&&!p.sealed);return <article className={'partner-card '+(state.team.includes(p.id)?'in-team':'')} key={p.id}>
      <div className="partner-top"><span>NO.{String(info.id).padStart(3,'0')}</span><span>{p.sealed?<><Lock size={13}/>待唤醒</>:state.team.includes(p.id)?<><Check size={14}/>出战中</>:'休息中'}</span></div>
      <div className="partner-art"><img src={asset('art',p.speciesId)} alt={info.name}/><div className="art-orbit"/></div>
      <div className="partner-name"><h2>{info.name}</h2><b>Lv.{p.level}</b></div><TypeIcons types={info.types} size={28} className="partner-types"/>
      <div className="exp-progress"><span style={{width:p.level>=50?'100%':100*(p.exp-10*(p.level-1)**2)/(10*p.level**2-10*(p.level-1)**2)+'%'}}/></div>
      <p className="partner-progress">{p.sealed?'再累计 '+p.sealed+' 天有效打卡，就能并肩出战':p.level>=50?'已达到关都篇等级上限':'距离下一级还需 '+(10*p.level**2-p.exp)+' 经验'}</p>
      <div className="partner-actions"><button disabled={busy||!!p.sealed||(!state.team.includes(p.id)&&state.team.length>=3)||(state.team.includes(p.id)&&state.team.length===1)} onClick={()=>toggle(p.id)}>{state.team.includes(p.id)?'休息一下':'加入队伍'}</button><button disabled={busy||!!p.sealed} onClick={()=>{setSelected(p);setMoves(p.moves);}}>装备招式</button></div>
      {possible.map(e=><button className="evolve-button" disabled={busy} key={e.to} onClick={()=>{if(window.confirm('让'+info.name+'进化为'+pokemon(e.to).name+'吗？也可以以后再进化。'))void run('evolve',{partnerId:p.id,speciesId:e.to});}}><Star size={15}/>进化为{pokemon(e.to).name}<ArrowUpRight size={15}/></button>)}
    </article>;})}</div>
    {selected&&<div className="modal-scrim"><section className="dialog"><button className="close" aria-label="关闭" onClick={()=>setSelected(null)}><X/></button><h2>{pokemon(selected.speciesId).name}的招式</h2><p>选择 1—4 个已学会的招式。</p><div className="learned-moves">{portraitMoves(selected).map(m=><label key={m.id}><input type="checkbox" checked={moves.includes(m.id)} disabled={!moves.includes(m.id)&&moves.length>=4} onChange={()=>setMoves(moves.includes(m.id)?moves.filter(x=>x!==m.id):[...moves,m.id])}/><span>{m.name}</span><TypeIcon type={m.type}/><small>威力 {m.power}</small></label>)}</div><button className="primary" disabled={busy||!moves.length} onClick={async()=>{const result=await run('moves.update',{partnerId:selected.id,moveIds:moves});if(result?.ok)setSelected(null);}}>准备好了</button></section></div>}
  </section>;
}
