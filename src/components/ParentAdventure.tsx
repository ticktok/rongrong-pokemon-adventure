import {useState} from 'react';
import {CalendarDays,Lock,Ticket} from 'lucide-react';
import type {PublicState} from '../game/types';
import {dexEntry,dexMatchRank} from '../game/pokedex';
import {pokemon} from '../game/catalog';
import {asset,type Run} from '../lib';

type Props={state:PublicState;run:Run;busy:boolean};
const weekdays=['周日','周一','周二','周三','周四','周五','周六'];

function GrantRow({state,run,busy,kind}:Props&{kind:'wild'|'gym'}){
  const [amount,setAmount]=useState('1');
  const gym=kind==='gym',name=gym?'道馆挑战':'野外遭遇';
  const today=state.daily.date===state.today;
  const used=today?(gym?state.daily.gymStarts??0:state.daily.encounters):0;
  const extra=today?(gym?state.daily.gymExtraStarts??0:state.daily.extraEncounters??0):0;
  const grant=(count:number)=>run('parent.adventure.grant',{kind,amount:count,date:state.today});
  return <section className="quota-row" aria-label={name}>
    <header><h3>{name}</h3><strong>剩余 {gym?state.gymRemaining:state.encounterRemaining} 次</strong></header>
    <p>基础 {gym?state.settings.gymLimit??1:state.settings.captureLimit} · 家长追加 {extra} · 已用 {used}</p>
    <div className="adventure-actions">
      {[1,3].map(count=><button key={count} disabled={busy} onClick={()=>void grant(count)}>+{count}</button>)}
      <input type="number" min="1" max="30" aria-label={name+'追加数量'} value={amount} onChange={e=>setAmount(e.target.value)}/>
      <button disabled={busy||!Number.isInteger(Number(amount))||Number(amount)<1||Number(amount)>30} onClick={()=>void grant(Number(amount))}>追加</button>
    </div>
  </section>;
}

function WeeklyRules({state,run,busy}:Props){
  const settings=state.settings;
  const [days,setDays]=useState(settings.adventureDays??[6,0]);
  const [wild,setWild]=useState(String(settings.captureLimit)),[gym,setGym]=useState(String(settings.gymLimit??1)),[balls,setBalls]=useState(String(settings.ballLimit??3));
  return <form id="weekly-rules" className="admin-panel" onSubmit={e=>{
    e.preventDefault();
    void run('parent.settings',{adventureDays:days,captureLimit:Number(wild),gymLimit:Number(gym),ballLimit:Number(balls)});
  }}>
    <h2><CalendarDays size={21}/> 每周冒险规则</h2>
    <fieldset className="parent-config" disabled={busy||state.contentMode==='follow'}>
      <legend>每周开放日</legend>
      <div className="adventure-days">{[1,2,3,4,5,6,0].map(day=><label key={day}><input type="checkbox" checked={days.includes(day)} onChange={e=>setDays(e.target.checked?[...days,day]:days.filter(d=>d!==day))}/>{weekdays[day]}</label>)}</div>
      <p>全部取消后，只在家长临时放行的当天开放。</p>
      <div className="form-grid">
        <label>每天野外遭遇次数<input required type="number" min="0" max="30" value={wild} onChange={e=>setWild(e.target.value)}/></label>
        <label>每天道馆挑战次数<input required type="number" min="0" max="30" value={gym} onChange={e=>setGym(e.target.value)}/></label>
        <label>每场野外精灵球数<input required type="number" min="1" max="10" value={balls} onChange={e=>setBalls(e.target.value)}/></label>
      </div>
      <p>已开始的战斗沿用开场时的精灵球数。</p><button className="primary">保存冒险规则</button>
    </fieldset>
  </form>;
}

function PartnerLocks({state,run,busy}:Props){
  const [replacement,setReplacement]=useState('');
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(1);
  const [reserveQuery,setReserveQuery]=useState('');
  const matches=(speciesId:number,q:string)=>Number.isFinite(dexMatchRank(dexEntry(speciesId)!,q));
  const byId=new Map(state.partners.map(p=>[p.id,p]));
  const ordered=[...state.team,...(state.boxes??[]).flatMap(box=>box.slots)].flatMap(id=>id&&byId.has(id)?[byId.get(id)!]:[]);
  const filtered=ordered.filter(p=>matches(p.speciesId,query)&&(filter==='all'||(filter==='team'?state.team.includes(p.id):!!p.parentLocked===(filter==='locked'))));
  const pages=Math.max(1,Math.ceil(filtered.length/12)),currentPage=Math.min(page,pages);
  const reserves=state.partners.filter(p=>!state.team.includes(p.id)&&!p.sealed&&!p.parentLocked);
  const position=(id:string)=>{
    const index=state.team.indexOf(id);
    if(index>=0)return '队伍第 '+(index+1)+' 位';
    const box=state.boxes?.find(box=>box.slots.includes(id));
    return box?box.name+' · 第 '+(box.slots.indexOf(id)+1)+' 格':'盒子里';
  };
  return <section id="partner-locks" className="admin-panel"><h2><Lock size={21}/> 伙伴上场管理</h2>
    <p>锁定后回到盒子，暂停上场和新的队伍打卡经验。解锁后可重新入队。</p>
    {!state.partners.length&&<p>选择初始伙伴后，就能在这里管理。</p>}
    <div className="lock-tools">
      <input type="search" aria-label="搜索上场伙伴" placeholder="名字、英文、拼音或图鉴编号" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/>
      <select aria-label="上场状态" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>
        <option value="all">全部伙伴</option><option value="team">队伍中</option><option value="locked">已锁定</option><option value="unlocked">未锁定</option>
      </select>
      <span>{filtered.length} 位伙伴</span>
    </div>
    {state.partners.length>0&&!filtered.length&&<p>没有找到匹配的伙伴。 <button onClick={()=>{setQuery('');setFilter('all');setPage(1);}}>清除筛选</button></p>}
    <div className="partner-lock-list">{filtered.slice((currentPage-1)*12,currentPage*12).map(p=>{
      const inTeam=state.team.includes(p.id),last=inTeam&&state.team.length===1;
      const reason=inTeam&&state.battle?.status==='active'?'等当前战斗结束后可锁定':inTeam&&state.question?'等当前题目完成后可锁定':last&&!reserves.length?'需先有一位已唤醒、未锁定的替补':'';
      return <div className="partner-lock-row" key={p.id}>
        <img src={asset('front',p.speciesId)} alt="" loading="lazy"/>
        <div><strong>{pokemon(p.speciesId).name} · Lv.{p.level}</strong><small>{position(p.id)}{p.sealed?' · 待唤醒':''}{p.parentLocked?' · 家长已锁定':' · 未锁定'}</small>
          {last&&reserves.length>0&&<><input type="search" aria-label="搜索替补" placeholder="搜索替补伙伴" value={reserveQuery} onChange={e=>{setReserveQuery(e.target.value);setReplacement('');}}/><select aria-label="选择替补" value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="">选择替补</option>{reserves.filter(r=>matches(r.speciesId,reserveQuery)).map(r=><option key={r.id} value={r.id}>{pokemon(r.speciesId).name} · Lv.{r.level} · {position(r.id)}</option>)}</select></>}
          {reason&&<small>{reason}</small>}
        </div>
        <button disabled={busy||!!reason||(last&&!reserves.some(r=>r.id===replacement))} onClick={()=>void run('parent.partner.lock',{partnerId:p.id,locked:!p.parentLocked,expectedRevision:state.revision,...(last?{replacementId:replacement}:{})})}>{p.parentLocked?'解锁':'锁定'}</button>
      </div>;
    })}</div>
    {pages>1&&<nav className="lock-pages" aria-label="伙伴分页"><button disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage} / {pages}</span><button disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>下一页</button></nav>}
  </section>;
}

export default function ParentAdventure(props:Props){
  const {state,run,busy}=props,s=state.settings;
  return <div className="adventure-admin">
    <nav className="adventure-actions" aria-label="冒险配置快捷入口">
      {[['daily-grants','今天加次数'],['partner-locks','伙伴上场管理'],['weekly-rules','每周冒险规则']].map(([id,label])=><button key={id} onClick={()=>document.getElementById(id)?.scrollIntoView({block:'start'})}>{label}</button>)}
    </nav>
    <section id="daily-grants" className="admin-panel"><h2><Ticket size={21}/> 今天加次数</h2><p>{state.today} · 开战时计次，追加次数在北京时间零点清零。</p>
      <div className="quota-grid"><GrantRow {...props} kind="wild"/><GrantRow {...props} kind="gym"/></div>
      <label className="toggle-row"><span>今天临时开放对战与捕捉<small>{state.canBattle?'今天可以冒险':'今天未开放，可先加次数再临时放行'}；道馆仍需满足徽章与区域条件。</small></span><input type="checkbox" checked={s.weekdayPassDate===state.today} disabled={busy||state.contentMode==='follow'} onChange={e=>void run('parent.settings',{weekdayPassDate:e.target.checked,date:state.today})}/></label>
    </section>
    <WeeklyRules {...props} key={JSON.stringify([s.adventureDays,s.captureLimit,s.gymLimit,s.ballLimit])}/>
    <PartnerLocks {...props}/>
  </div>;
}
