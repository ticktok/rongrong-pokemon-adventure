import {useEffect,useMemo,useRef,useState} from 'react';
import {Search,Check,Lock,X,ChevronDown,ArrowDown,BookOpen,SlidersHorizontal} from 'lucide-react';
import {TypeIcon,TypeIcons} from './TypeIcon';
import {TYPE_NAMES} from '../../content/world';
import {catalog,acquisition} from '../game/catalog';
import {DEX_DISPLAY,DEX_GENERATIONS,dexCatalog,dexEntry,dexNumber,dexPresentation,dexSuggestions,filterDex,generationLabel,matchesDexStatus,type DexEntry,type DexStatus,type GenerationId} from '../game/pokedex';
import type {PublicState} from '../game/types';
import './Pokedex.css';

const generationCounts=new Map(DEX_GENERATIONS.map(g=>[g.id,dexCatalog.filter(e=>e.generation===g.id).length]));
const statusOptions=[['all','全部'],['seen','已遇见'],['caught','已收录']] as const;

function DexArtwork({entry,large=false}:{entry:DexEntry;large?:boolean}){
 const [failed,setFailed]=useState(false),presentation=dexPresentation(entry);
 return <span className={'dex-artwork'+(large?' large':'')}>
  {presentation.artwork&&!failed?<img loading="lazy" src={import.meta.env.BASE_URL+presentation.artwork} alt={entry.name} onError={()=>setFailed(true)}/>:<span className="dex-question" aria-label={failed?'图片暂不可用':'图片未解锁'}>?</span>}
 </span>;
}
function DexTypes({types}:{types:readonly string[]}){
 return <span className="dex-types">{types.map(type=><span className={'dex-type-label type-'+type} key={type}><TypeIcon type={type}/><span>{TYPE_NAMES[type]}</span></span>)}</span>;
}

export default function Pokedex({state}:{state:PublicState}){
 const [generation,setGeneration]=useState<GenerationId|'all'>(DEX_DISPLAY.activeGeneration);
 const [type,setType]=useState(''),[status,setStatus]=useState<DexStatus>('all');
 const [input,setInput]=useState(''),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const [typesOpen,setTypesOpen]=useState(false),[limit,setLimit]=useState(60),[selected,setSelected]=useState<number|null>(null);
 const composing=useRef(false),dialog=useRef<HTMLDialogElement>(null),tabs=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null);
 const suggestions=useMemo(()=>dexSuggestions(query),[query]);
 const list=useMemo(()=>filterDex({generation,type,status,query},state),[generation,type,status,query,state]);
 const visible=generation==='all'?list.slice(0,limit):list;
 const detail=selected===null?null:dexEntry(selected),playable=detail?catalog.find(p=>p.id===detail.id):undefined;
 const currentEntries=dexCatalog.filter(e=>e.generation===DEX_DISPLAY.activeGeneration);
 const caught=currentEntries.filter(e=>state.caught.includes(e.id)).length;
 const currentRegion=DEX_GENERATIONS.find(g=>g.id===DEX_DISPLAY.activeGeneration)?.region??'';
 const title=generation==='all'?'全国图鉴':generationLabel(generation);
 const preview=generation!=='all'&&!DEX_DISPLAY.artworkGenerations.includes(generation);
 const reduced=()=>document.documentElement.dataset.reduced==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches;

 useEffect(()=>{setLimit(60);},[generation,type,status,query]);
 useEffect(()=>{
  if(open&&active>=0&&suggestions[active])document.getElementById('dex-option-'+suggestions[active].id)?.scrollIntoView({block:'nearest'});
 },[open,active,suggestions]);
 useEffect(()=>{
  const row=tabs.current,button=row?.querySelector<HTMLElement>('[aria-pressed="true"]');
  if(row&&button&&row.scrollWidth>row.clientWidth)row.scrollTo({left:button.offsetLeft-row.offsetLeft-(row.clientWidth-button.clientWidth)/2,behavior:reduced()?'instant':'smooth'});
 },[generation]);
 useEffect(()=>{if(selected!==null&&!dialog.current?.open)dialog.current?.showModal();},[selected]);
 function clearSearch(){setInput('');setQuery('');setOpen(false);setActive(-1);}
 function clearFilters(){clearSearch();setType('');setStatus('all');}
 function choose(entry:DexEntry){
  setGeneration(entry.generation);clearSearch();
  if(type&&!entry.types.includes(type))setType('');
  if(!matchesDexStatus(entry,status,state))setStatus('all');
  setSelected(entry.id);
 }
 function closeDetail(){
  const id=selected;dialog.current?.close();setSelected(null);
  requestAnimationFrame(()=>{const card=document.getElementById('dex-card-'+id);if(card){card.focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:reduced()?'instant':'smooth'});}else search.current?.focus();});
 }
 function updateSearch(value:string){setQuery(value);setOpen(true);setActive(-1);}
 return <section className="page-content dex-page">
  <div className="section-heading dex-heading"><div><span className="eyebrow">A WORLD OF DISCOVERIES</span><h1>融融的发现图鉴</h1><p>从熟悉的伙伴出发，认识更大的宝可梦世界。</p></div><div className="dex-progress"><span>{currentRegion}收藏</span><div><strong>{caught}</strong><span> / {currentEntries.length}</span></div><small>已成为伙伴</small></div></div>
  <div className="dex-generation-tabs" ref={tabs} role="group" aria-label="按首次登场世代筛选">
   <button type="button" aria-pressed={generation==='all'} onClick={()=>setGeneration('all')}><BookOpen size={16}/><span>全国图鉴</span><small>{dexCatalog.length}</small></button>
   {DEX_GENERATIONS.map(g=><button type="button" key={g.id} aria-pressed={generation===g.id} onClick={()=>setGeneration(g.id)}><span>{g.label}</span><small>{generationCounts.get(g.id)}</small></button>)}
  </div>
  <div className="collection-toolbar dex-toolbar">
   <div className="dex-search-container" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    <label className="search-box"><Search size={19}/><input ref={search} role="combobox" aria-label="搜索宝可梦" aria-expanded={open&&!!query} aria-autocomplete="list" aria-controls="dex-suggestions" aria-activedescendant={open&&active>=0&&suggestions[active]?'dex-option-'+suggestions[active].id:undefined} placeholder="名字、英文、拼音或编号" autoComplete="off" value={input}
     onChange={e=>{setInput(e.target.value);if(!composing.current)updateSearch(e.target.value);}}
     onCompositionStart={()=>{composing.current=true;setOpen(false);}}
     onCompositionEnd={e=>{composing.current=false;updateSearch(e.currentTarget.value);}}
     onFocus={()=>{if(query)setOpen(true);}}
     onKeyDown={e=>{
      if(composing.current||e.nativeEvent.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();setOpen(false);setActive(-1);}
      if((e.key==='ArrowDown'||e.key==='ArrowUp')&&suggestions.length){e.preventDefault();setOpen(true);setActive(i=>e.key==='ArrowDown'?(i+1)%suggestions.length:(i<=0?suggestions.length:i)-1);}
      if(e.key==='Enter'&&open&&suggestions.length){e.preventDefault();choose(suggestions[Math.max(0,active)]);}
     }}/></label>
    {input&&<button type="button" className="dex-search-clear" aria-label="清空搜索" onClick={()=>{clearSearch();search.current?.focus();}}><X size={17}/></button>}
    <div className="dex-suggestions" hidden={!open||!query}>
     <div className="dex-suggestion-heading">在全国图鉴中寻找<span>点选前往所属世代</span></div>
     <div id="dex-suggestions" role="listbox" aria-label="全国图鉴搜索建议">{suggestions.map((entry,i)=><button type="button" role="option" tabIndex={-1} aria-selected={active===i} id={'dex-option-'+entry.id} key={entry.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(entry)}>
      <span className="dex-suggestion-number">{dexNumber(entry.id)}</span><span className="dex-suggestion-name"><strong>{entry.name}</strong><small>{entry.english}</small></span><span className="dex-suggestion-generation">{generationLabel(entry.generation)}</span>
     </button>)}</div>{!suggestions.length&&<p className="dex-no-suggestions">没有找到，试试名字的一部分。</p>}
    </div>
   </div>
   <div className="segmented" role="group" aria-label="收录状态">{statusOptions.map(([id,label])=><button type="button" aria-pressed={status===id} className={status===id?'active':''} key={id} onClick={()=>setStatus(id)}>{label}</button>)}</div>
  </div>
  <div className={'dex-type-section'+(typesOpen?' expanded':'')}>
   <button type="button" className="dex-type-toggle" aria-expanded={typesOpen} aria-controls="dex-type-options" onClick={()=>setTypesOpen(!typesOpen)}><SlidersHorizontal size={16}/><span>属性筛选</span><b>{type?TYPE_NAMES[type]:'全部属性'}</b><ChevronDown size={16}/></button>
   <div className="dex-type-options" id="dex-type-options" role="group" aria-label="选择一个属性"><span className="dex-type-caption">属性</span><button type="button" aria-pressed={!type} onClick={()=>setType('')}>全部属性</button>{Object.entries(TYPE_NAMES).map(([id,name])=><button type="button" aria-pressed={type===id} key={id} onClick={()=>setType(type===id?'':id)}><TypeIcon type={id}/>{name}</button>)}</div>
  </div>
  <div className="dex-result-heading"><div><strong>{title}</strong>{preview?<span className="dex-preview-label"><Lock size={12}/>预览中</span>:<span className="dex-region-note">{generation==='all'?'九个世代，慢慢发现':'当前开放世代'}</span>}</div><span role="status" aria-live="polite">{list.length} 只{generation==='all'&&visible.length<list.length?' · 已显示 '+visible.length:''}</span></div>
  {preview&&<p className="dex-preview-note">先认识名字和属性，图片将在图鉴升级后解锁。</p>}
  <div className="dex-grid">{visible.map(entry=>{
   const available=dexPresentation(entry).available,isCaught=state.caught.includes(entry.id),seen=state.seen.includes(entry.id);
   return <button type="button" id={'dex-card-'+entry.id} key={entry.id} className={'dex-card '+(!available?'preview':isCaught?'caught':seen?'seen':'undiscovered')} aria-label={dexNumber(entry.id)+' '+entry.name+' '+entry.types.map(t=>TYPE_NAMES[t]).join('、')+' · '+(!available?'未解锁':isCaught?'已收录':seen?'已遇见':'未遇见')} onClick={()=>{setOpen(false);setSelected(entry.id);}}>
    <span className="dex-number">{dexNumber(entry.id)}</span><DexArtwork entry={entry}/><strong>{entry.name}</strong><DexTypes types={entry.types}/><span className="dex-card-state">{!available?<><Lock size={11}/>未解锁</>:isCaught?'已收录':seen?'已遇见':'未遇见'}</span>{available&&isCaught&&<Check className="caught-check" size={16}/>}
   </button>;
  })}</div>
  {!list.length&&<div className="empty-state"><Search size={28}/><h2>这里还没有找到</h2><p>{title} · {type?TYPE_NAMES[type]+'属性':'全部属性'} · {statusOptions.find(([id])=>id===status)?.[1]}{query?' · “'+query+'”':''}</p><p>搜索下拉可以帮你找到其他世代的宝可梦。</p><button type="button" onClick={clearFilters}>清除筛选</button></div>}
  {generation==='all'&&visible.length<list.length&&<div className="dex-load-more"><button type="button" onClick={()=>setLimit(n=>n+60)}>加载更多<ArrowDown size={16}/></button><span>已显示 {visible.length} / {list.length} 只</span></div>}
  {detail&&<dialog ref={dialog} className="dialog dex-detail dex-native-dialog" aria-labelledby="dex-detail-title" onCancel={e=>{e.preventDefault();closeDetail();}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeDetail();}}}>
   <button type="button" className="close" aria-label="关闭详情" onClick={closeDetail}><X/></button><DexArtwork key={detail.id} entry={detail} large/><span className="eyebrow">全国图鉴 {dexNumber(detail.id)}</span><h2 id="dex-detail-title">{detail.name}</h2>
   {dexPresentation(detail).available?<><p className="english">{detail.english}</p><TypeIcons types={detail.types} size={32}/>{playable&&<><p>{acquisition(detail.id)}</p><div className="stat-grid">{[['hp','体力'],['attack','攻击'],['defense','防御'],['speed','速度']].map(([key,label])=><div key={key}><span>{label}</span><b>{playable.stats[key]}</b></div>)}</div></>}</>:<><DexTypes types={detail.types}/><p className="dex-detail-locked"><Lock size={14}/>未解锁</p></>}
  </dialog>}
 </section>;
}
