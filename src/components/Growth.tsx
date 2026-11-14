import {useEffect,useState} from 'react';
import {ArrowRight,BookOpen,Check,Sparkles,Star} from 'lucide-react';
import type {GrowthEntry,PublicState} from '../game/types';
import {pokemon,evolutions} from '../game/catalog';
import {asset,type Run} from '../lib';
import Dialog from './Dialog';
import './Growth.css';

export function summarizeGrowth(entries:GrowthEntry[]){
 const summaries=new Map<string,GrowthEntry>();
 for(const entry of entries){const previous=summaries.get(entry.partnerId);summaries.set(entry.partnerId,previous?{...entry,fromExp:previous.fromExp,fromLevel:previous.fromLevel,fromSpecies:previous.fromSpecies}:entry);}
 return [...summaries.values()];
}
type Presentation={entries:GrowthEntry[];through:number;history:boolean};
export default function Growth({state,run,busy,pending,error,retry,blocked,historyOpen,closeHistory,inspect,viewTeam}:{state:PublicState;run:Run;busy:boolean;pending:boolean;error:string;retry:()=>void;blocked:boolean;historyOpen:boolean;closeHistory:()=>void;inspect:(id:string)=>void;viewTeam:()=>void}){
 const [shown,setShown]=useState<Presentation|null>(null),[otherDialog,setOtherDialog]=useState(false);
 useEffect(()=>{
  const check=()=>setOtherDialog(!!document.querySelector('dialog[open]:not(.growth-dialog), .modal-scrim'));
  check();const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(shown){if(!shown.history&&(state.growth?.readThrough??0)>=shown.through)setShown(null);return;}
  if(blocked||otherDialog||busy||pending)return;
  if(historyOpen){setShown({entries:[...(state.growth?.entries??[])],through:0,history:true});return;}
  if(state.role!=='child')return;
  const entries=state.growth?.entries.filter(e=>e.seq>state.growth!.readThrough)??[];
  if(entries.length)setShown({entries,through:entries.at(-1)!.seq,history:false});
 },[state.growth,state.role,shown,blocked,otherDialog,busy,pending,historyOpen]);
 if(!shown)return null;
 const close=async(after?:()=>void)=>{
  if(busy||pending)return;
  if(shown.history){closeHistory();setShown(null);after?.();return;}
  if((await run('growth.ack',{through:shown.through}))?.ok){setShown(null);after?.();}
 };
 const entries=shown.history?[...shown.entries].reverse():summarizeGrowth(shown.entries);
 const deferred=(state.sharedRewards??[]).reduce((n,r)=>n+r.base,0),unallocated=state.claimableExp,unallocatedBase=state.sharedUnallocated??0;
 return <Dialog title={shown.history?'成长记录':'伙伴又成长啦！'} className="growth-dialog" onClose={()=>void close()} error={error} retry={pending?retry:undefined}>
  <div className="growth-intro"><span className="growth-seal"><Sparkles size={24}/></span><p>{shown.history?'每一份努力，都留在冒险手册里。':'你的努力，正在变成伙伴的力量。'}<small>{shown.history?'已读记录保留最近 80 条，未读记录一直保留。':'这次有 '+summarizeGrowth(shown.entries).length+' 位伙伴成长，向下翻看吧。'}</small></p></div>
  {!entries.length&&<p className="growth-empty">还没有新的成长记录。一起练习，慢慢长大吧！</p>}
  <div className="growth-list">{entries.map(e=>{
   const evolved=e.fromSpecies!==e.toSpecies,levelled=e.toLevel>e.fromLevel,earned=e.toExp-e.fromExp,partner=state.partners.find(p=>p.id===e.partnerId);
   const canEvolve=partner&&!partner.sealed&&evolutions.some(v=>v.from===partner.speciesId&&partner.level>=v.level);
   const progress=e.toLevel>=50?100:Math.max(0,Math.min(100,100*(e.toExp-10*(e.toLevel-1)**2)/(10*e.toLevel**2-10*(e.toLevel-1)**2)));
   return <article className={'growth-card '+(evolved?'growth-evolved':'')} key={e.seq}>
    <div className="growth-portrait">{evolved&&<img className="growth-before" src={asset('art',e.fromSpecies)} alt={pokemon(e.fromSpecies).name}/>}<img className={evolved?'growth-after':''} src={asset('art',e.toSpecies)} alt={pokemon(e.toSpecies).name}/>{levelled&&<span><Star size={12}/>升级啦</span>}</div>
    <div className="growth-details"><h3>{pokemon(e.toSpecies).name}</h3>{earned>0&&<p className="growth-earned">+{earned}<small>经验</small></p>}<p className="growth-level">{levelled?<>Lv.{e.fromLevel}<ArrowRight size={15}/><b>Lv.{e.toLevel}</b></>:<>现在是 <b>Lv.{e.toLevel}</b></>}</p>
     {evolved&&<p className="growth-evolution">{pokemon(e.fromSpecies).name}<ArrowRight size={14}/>{pokemon(e.toSpecies).name}</p>}
     <div className="growth-progress" role="progressbar" aria-label={pokemon(e.toSpecies).name+'经验进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:progress+'%'}}/></div>
     <small>{e.toLevel>=50?'已达到关都篇等级上限':'距离下一级还需 '+(10*e.toLevel**2-e.toExp)+' 经验'}</small>
     {shown.history&&<time>{new Date(e.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>}
     {canEvolve&&<button className="growth-evolve-link" disabled={busy||pending} onClick={()=>void close(()=>inspect(e.partnerId))}><Star size={14}/>可以进化了，去看看<ArrowRight size={14}/></button>}
    </div>
   </article>;
  })}</div>
  {(deferred>0||state.carry>0||unallocated>0||unallocatedBase>0)&&<p className="growth-deferred">以下奖励尚未到账，不计入上方经验：{deferred>0?`${deferred} 基础经验顺延；`:''}{state.carry>0?`${state.carry} 历史经验顺延；`:''}{unallocated>0?`${unallocated} 经验待分配；`:''}{unallocatedBase>0?`${unallocatedBase} 基础经验待分配。`:''}</p>}
  <div className="growth-actions"><button className="primary" disabled={busy||pending} onClick={()=>void close()}><Check size={18}/>{busy?'正在保存…':shown.history?'收好手册':'知道啦'}</button>{!shown.history&&<button disabled={busy||pending} onClick={()=>void close(viewTeam)}><BookOpen size={17}/>查看伙伴</button>}</div>
 </Dialog>;
}
