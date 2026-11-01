import {useEffect,useState} from 'react';
import {Shield} from 'lucide-react';
import type {PublicState} from '../game/types';
import {BADGE_COLLECTIONS,collectionId} from '../game/badges';
export function BadgeImage({image,name}:{image:string;name:string}){
  const [failed,setFailed]=useState(false);
  return failed?<Shield aria-label={name+'图片暂不可用'} size={48}/>:<img src={import.meta.env.BASE_URL+image} alt={name} onError={()=>setFailed(true)}/>;
}
export default function BadgeCollection({state,collections=BADGE_COLLECTIONS}:{state:PublicState;collections?:typeof BADGE_COLLECTIONS}){
  const [id,setId]=useState(()=>collectionId(location.hash,collections));
  useEffect(()=>{const change=()=>setId(collectionId(location.hash,collections));window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[collections]);
  const selected=collections.find(p=>p.id===id)??collections[0];
  if(!selected)return <main className="page-content"><h1>我的收藏</h1><p>新的冒险正在准备中。</p></main>;
  const select=(value:string)=>{setId(value);location.hash='/collection?generation='+encodeURIComponent(value);};
  const count=selected.badges.filter(b=>state.badges.includes(b.regionId)).length;
  return <main className="page-content badge-collection"><div className="section-heading"><div><span className="eyebrow">MEMORIES OF OUR ADVENTURE</span><h1>一路收集的勇气</h1><p>每一枚徽章，都记着你和伙伴一起努力的时光。</p></div><span className="soft-tag">已收集 {count} / {selected.badges.length} 枚</span></div>
    <div className="badge-tabs" role="tablist" aria-label="徽章世代">{collections.map((p,index)=><button key={p.id} id={'badge-tab-'+p.id} role="tab" aria-selected={p.id===selected.id} aria-controls="badge-panel" tabIndex={p.id===selected.id?0:-1} onClick={()=>select(p.id)} onKeyDown={e=>{let next=index;if(e.key==='ArrowRight')next=(index+1)%collections.length;else if(e.key==='ArrowLeft')next=(index+collections.length-1)%collections.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=collections.length-1;else return;e.preventDefault();select(collections[next].id);document.getElementById('badge-tab-'+collections[next].id)?.focus();}}>{p.label}</button>)}</div>
    <section id="badge-panel" role="tabpanel" aria-labelledby={'badge-tab-'+selected.id} className="badge-grid">{selected.badges.map(b=>{const earned=state.badges.includes(b.regionId),date=state.gymProgress?.firstWins[b.regionId];return <article key={b.regionId} className={'badge-card '+(earned?'earned':'unearned')}><div className="badge-art"><BadgeImage image={b.image} name={b.name}/></div><span className="badge-status">{earned?'已获得':'尚未获得'}</span><h2>{b.name}</h2><p>{b.region} · {b.leader}</p>{earned&&date?<time dateTime={date}>{date} 获得</time>:<small>{earned?'一段值得珍藏的冒险':'慢慢前行，期待下一次相遇'}</small>}</article>;})}</section>
  </main>;
}
