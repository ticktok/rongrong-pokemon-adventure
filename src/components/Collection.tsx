import {useState} from 'react';
import {Search,Check,Lock,ArrowUpRight,X,Heart,Star} from 'lucide-react';
import {TypeIcon,TypeIcons} from './TypeIcon';
import {catalog,pokemon,evolutions,portraitMoves,acquisition} from '../game/catalog';
import {asset,type Run} from '../lib';
import type {Partner,PublicState} from '../game/types';
export function Team({state,run,busy}:{state:PublicState;run:Run;busy:boolean}){
  const [selected,setSelected]=useState<Partner|null>(null),[moves,setMoves]=useState<string[]>([]);
  const toggle=(id:string)=>{const team=state.team.includes(id)?state.team.filter(x=>x!==id):[...state.team,id];void run('team.update',{partnerIds:team});};
  return <section className="page-content"><div className="section-heading"><div><span className="eyebrow">OUR LITTLE TEAM</span><h1>一起长大的伙伴</h1><p>每一份认真，都在让你们变得更强。</p></div><span className="soft-tag"><Heart size={17}/>{state.partners.length} 位伙伴 · {state.team.length}/3 出战</span></div>
    <div className="partner-grid">{state.partners.map(p=>{const info=pokemon(p.speciesId),possible=evolutions.filter(e=>e.from===p.speciesId&&p.level>=e.level&&!p.sealed);return <article className={'partner-card '+(state.team.includes(p.id)?'in-team':'')} key={p.id}>
      <div className="partner-top"><span>NO.{String(info.id).padStart(3,'0')}</span><span>{p.sealed?<><Lock size={13}/>待唤醒</>:state.team.includes(p.id)?<><Check size={14}/>出战中</>:'休息中'}</span></div>
      <div className="partner-art"><img src={asset('art',p.speciesId)} alt={info.name}/><div className="art-orbit"/></div>
      <div className="partner-name"><h2>{info.name}</h2><b>Lv.{p.level}</b></div><TypeIcons types={info.types} size={28} className="partner-types"/>
      <div className="exp-progress"><span style={{width:p.level>=50?'100%':100*(p.exp-10*(p.level-1)**2)/(10*p.level**2-10*(p.level-1)**2)+'%'}}/></div>
      <p className="partner-progress">{p.sealed?'再坚持 '+p.sealed+' 天打卡，就能并肩出战':p.level>=50?'已达到关都篇等级上限':'距离下一级还需 '+(10*p.level**2-p.exp)+' 经验'}</p>
      <div className="partner-actions"><button disabled={busy||!!p.sealed||(!state.team.includes(p.id)&&state.team.length>=3)||(state.team.includes(p.id)&&state.team.length===1)} onClick={()=>toggle(p.id)}>{state.team.includes(p.id)?'休息一下':'加入队伍'}</button><button disabled={busy||!!p.sealed} onClick={()=>{setSelected(p);setMoves(p.moves);}}>装备招式</button></div>
      {possible.map(e=><button className="evolve-button" disabled={busy} key={e.to} onClick={()=>{if(window.confirm('让'+info.name+'进化为'+pokemon(e.to).name+'吗？也可以以后再进化。'))void run('evolve',{partnerId:p.id,speciesId:e.to});}}><Star size={15}/>进化为{pokemon(e.to).name}<ArrowUpRight size={15}/></button>)}
    </article>;})}</div>
    {selected&&<div className="modal-scrim"><section className="dialog"><button className="close" aria-label="关闭" onClick={()=>setSelected(null)}><X/></button><h2>{pokemon(selected.speciesId).name}的招式</h2><p>选择 1—4 个已学会的招式。</p><div className="learned-moves">{portraitMoves(selected).map(m=><label key={m.id}><input type="checkbox" checked={moves.includes(m.id)} disabled={!moves.includes(m.id)&&moves.length>=4} onChange={()=>setMoves(moves.includes(m.id)?moves.filter(x=>x!==m.id):[...moves,m.id])}/><span>{m.name}</span><TypeIcon type={m.type}/><small>威力 {m.power}</small></label>)}</div><button className="primary" disabled={busy||!moves.length} onClick={async()=>{const result=await run('moves.update',{partnerId:selected.id,moveIds:moves});if(result?.ok)setSelected(null);}}>准备好了</button></section></div>}
  </section>;
}
export function Pokedex({state}:{state:PublicState}){
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState<number|null>(null);
  const list=catalog.filter(p=>(p.name.includes(search)||p.english.includes(search.toLowerCase())||String(p.id)===search)&&(filter==='all'||(filter==='caught'?state.caught.includes(p.id):state.seen.includes(p.id))));
  const detail=selected?pokemon(selected):null;
  return <section className="page-content"><div className="section-heading"><div><span className="eyebrow">KANTO FIELD GUIDE</span><h1>融融的发现图鉴</h1><p>每次相遇，都值得好好记下来。</p></div><div className="dex-counter"><strong>{state.caught.length}</strong><span>/ 151<br/>已成为伙伴</span></div></div>
    <div className="collection-toolbar"><label className="search-box"><Search size={19}/><input aria-label="搜索宝可梦" placeholder="找名字、英文名或图鉴编号" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="segmented">{[['all','全部'],['seen','已遇见'],['caught','已收录']].map(([id,label])=><button className={filter===id?'active':''} key={id} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
    <div className="dex-grid">{list.map(p=><button key={p.id} className={'dex-card '+(state.caught.includes(p.id)?'caught':state.seen.includes(p.id)?'seen':'undiscovered')} onClick={()=>setSelected(p.id)}><span className="dex-number">#{String(p.id).padStart(3,'0')}</span><img loading="lazy" src={asset('art',p.id)} alt={p.name}/><strong>{p.name}</strong><TypeIcons types={p.types}/>{state.caught.includes(p.id)&&<Check className="caught-check" size={16}/>}</button>)}</div>
    {!list.length&&<div className="empty-state">这次没找到，试试其他名字。</div>}
    {detail&&<div className="modal-scrim"><section className="dialog dex-detail"><button className="close" aria-label="关闭" onClick={()=>setSelected(null)}><X/></button><img src={asset('art',detail.id)} alt={detail.name}/><span className="eyebrow">NO. {String(detail.id).padStart(3,'0')}</span><h2>{detail.name}</h2><p className="english">{detail.english}</p><TypeIcons types={detail.types} size={32}/><p>{acquisition(detail.id)}</p><div className="stat-grid">{[['hp','体力'],['attack','攻击'],['defense','防御'],['speed','速度']].map(([key,label])=><div key={key}><span>{label}</span><b>{detail.stats[key]}</b></div>)}</div></section></div>}
  </section>;
}
