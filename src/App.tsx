import {useCallback,useEffect,useRef,useState} from 'react';
import {Compass,BookOpen,Heart,NotebookPen,ShieldCheck,Volume2,LogOut,Sparkles,ArrowRight,Check,Cloud,RefreshCw,X,Map,Lock,Flag,ChevronRight,Leaf,Sun,Target,LoaderCircle,Settings2} from 'lucide-react';
import {auth,request,asset,dueWords,type Run} from './lib';
import {REGIONS} from '../content/world';
import {TypeIcons} from './components/TypeIcon';
import {NPC_GIFTS} from '../content/packs';
import {pokemon} from './game/catalog';
import type {PublicState,ApiResponse,GameCommand,Npc,DailyFeedback} from './game/types';
import World from './components/World';
import Quiz from './components/Quiz';
import Pronunciation from './components/Pronunciation';
import {stopPronunciation} from './pronunciation';
import Battle from './components/Battle';
import {Team,Pokedex} from './components/Collection';
import Parent from './components/Parent';
import {prepareAudio,playEffect} from './audio';
import {version} from '../package.json';
const pages=['adventure','partners','pokedex','learning','parent'];
function pageFromHash(){const value=location.hash.slice(1).replace(/^\//,'');return pages.includes(value)?value:'adventure';}
export default function App(){
  const [user,setUser]=useState<string|null>(null),[authReady,setAuthReady]=useState(false),[error,setError]=useState('');
  const currentUid=useRef<string|null>(null);
  const isCurrent=useCallback((uid:string)=>currentUid.current===uid,[]);
  useEffect(()=>{
    let alive=true,authEvent=false;
    const accept=(uid:string|null)=>{if(alive){currentUid.current=uid;setUser(uid);setError('');setAuthReady(true);}};
    const listener=auth.onAuthStateChange((_event,session)=>{authEvent=true;accept(session&&!session.user.is_anonymous?String(session.user.id):null);});
    auth.getSession().then(({data,error})=>{
      if(!alive||authEvent)return;
      if(error){setError(error.message);setAuthReady(true);return;}
      accept(data?.session&&!data.session.user.is_anonymous?String(data.session.user.id):null);
    }).catch(e=>{if(alive&&!authEvent){setError(String(e));setAuthReady(true);}});
    return()=>{alive=false;currentUid.current=null;listener.data.subscription.unsubscribe();};
  },[]);
  if(!authReady)return <div className="loading-screen"><div className="pokeball"/><p>正在打开冒险手册…</p></div>;
  if(!user)return <Login onError={setError} error={error}/>;
  return <GameSession key={user} user={user} isCurrent={isCurrent}/>;
}
function GameSession({user,isCurrent}:{user:string;isCurrent:(uid:string)=>boolean}){
  const [state,setState]=useState<PublicState|null>(null);
  const [feedback,setFeedback]=useState<DailyFeedback|null>(null);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[tab,setTab]=useState(pageFromHash),[effect,setEffect]=useState('');
  const [sound,setSound]=useState(localStorage.getItem('rr-sound')!=='off'),[reduced,setReduced]=useState(localStorage.getItem('rr-reduced')==='on'),[npc,setNpc]=useState<Npc|null>(null),[mapOpen,setMapOpen]=useState(false),[pending,setPending]=useState<GameCommand|null>(null),[settingsOpen,setSettingsOpen]=useState(false);
  const [selectedTasks,setSelectedTasks]=useState<string[]>([]),[starter,setStarter]=useState(25);
  const busyRef=useRef(false),aliveRef=useRef(true),noticeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const pendingRef=useRef<GameCommand|null>(null),soundRef=useRef(sound);
  soundRef.current=sound;
  useEffect(()=>{aliveRef.current=true;return()=>{aliveRef.current=false;clearTimeout(noticeTimer.current);};},[]);
  const perform=useCallback(async(command:GameCommand):Promise<ApiResponse|undefined>=>{
    if(!aliveRef.current||!isCurrent(user)||busyRef.current)return;
    if(pendingRef.current&&command.type!=='bootstrap'&&command.operationId!==pendingRef.current.operationId){setError('先重试上次的操作，确认云端结果后再继续吧。');return;}
    busyRef.current=true;setBusy(true);setError('');
    const key='rr-pending-'+user;
    if(command.type!=='bootstrap'){localStorage.setItem(key,JSON.stringify(command));setPending(command);pendingRef.current=command;}
    try{
      const result=await request(command,user);
      if(!aliveRef.current||!isCurrent(user))return;
      if(!result.ok){localStorage.removeItem(key);setPending(null);pendingRef.current=null;throw new Error(result.error??'这次操作没有完成');}
      if(result.state){
        setState(old=>!old||result.state!.revision>=old.revision?result.state!:old);
        const f=result.result?.dailyFeedback;
        setFeedback(previous=>{
          if(result.state!.question)return null;
          const candidate=f??previous;
          return candidate?.date===result.state!.daily.date&&candidate.completed===result.state!.daily.questions?candidate:null;
        });
      }
      if(command.type!=='bootstrap'){localStorage.removeItem(key);setPending(null);pendingRef.current=null;}
      setEffect(result.result?.effect??'');
      if(result.result?.effect)playEffect(result.result.effect,soundRef.current);
      if(result.result?.dailyFeedback){setNotice('');clearTimeout(noticeTimer.current);}
      else if(result.result?.message){setNotice(result.result.message);clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),6500);}
      return result;
    }catch(e){if(aliveRef.current&&isCurrent(user))setError(e instanceof Error?e.message:'暂时连接不上，请稍后重试');}
    finally{busyRef.current=false;if(aliveRef.current&&isCurrent(user))setBusy(false);}
  },[user,isCurrent]);
  const run:Run=useCallback((type,payload={})=>perform({type,payload,operationId:crypto.randomUUID()}),[perform]);
  useEffect(()=>{const saved=localStorage.getItem('rr-pending-'+user);if(saved){try{const restored=JSON.parse(saved) as GameCommand;setPending(restored);pendingRef.current=restored;}catch{setError('上次未完成的操作记录无法读取，请刷新云端存档');}}void run('bootstrap');},[user,run]);
  useEffect(()=>{const handler=()=>setTab(pageFromHash());window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);},[]);
  useEffect(()=>{document.documentElement.dataset.reduced=String(reduced);localStorage.setItem('rr-reduced',reduced?'on':'off');},[reduced]);
  useEffect(()=>{localStorage.setItem('rr-sound',sound?'on':'off');},[sound]);
  useEffect(()=>{const unlock=()=>{if(soundRef.current)prepareAudio();};window.addEventListener('pointerdown',unlock,{passive:true});return()=>window.removeEventListener('pointerdown',unlock);},[]);
  useEffect(()=>{stopPronunciation();return stopPronunciation;},[tab]);
  const navigate=(page:string)=>{setFeedback(null);setTab(page);location.hash='/'+page;setNpc(null);};
  if(!state)return <div className="loading-screen"><div className="pokeball"/><h2>正在取回云端存档</h2>{error&&<p className="error-text">{error}</p>}<button onClick={()=>run('bootstrap')} disabled={busy}><RefreshCw size={16}/>重新连接</button><button className="text-button" onClick={()=>auth.signOut()}>切换账号</button></div>;
  const region=REGIONS.find(r=>r.id===state.position.regionId)!,today=state.checkins.find(c=>c.date===state.today),nav=[['adventure','去冒险',Compass],['partners','我的伙伴',Heart],['pokedex','发现图鉴',BookOpen],['learning','学习手册',NotebookPen]] as const;
  const renderTasks=()=> <section className="paper-panel daily-tasks"><span className="paper-tape"/><div className="eyebrow">TODAY'S LITTLE STEPS</div><h2>今天的小目标<Sun size={20}/></h2><p>认真做好，再把努力记下来。</p><div className="task-list">{state.settings.tasks.filter(t=>t.active).map(t=><label key={t.id}><input type="checkbox" disabled={busy||today?.status==='pending'||today?.status==='approved'} checked={today&&today.status!=='rejected'?today.taskIds.includes(t.id):selectedTasks.includes(t.id)} onChange={()=>setSelectedTasks(selectedTasks.includes(t.id)?selectedTasks.filter(x=>x!==t.id):[...selectedTasks,t.id])}/><span>{t.name}</span><Check size={14}/></label>)}</div><button className="primary full" disabled={busy||today?.status==='pending'||today?.status==='approved'||!selectedTasks.length} onClick={()=>run('checkin.submit',{taskIds:selectedTasks})}>{today?.status==='approved'?'今天的努力已收到':today?.status==='pending'?'等待家长确认':'完成啦，提交打卡'}<ArrowRight size={16}/></button>{today?.status==='rejected'&&<p className="task-feedback">家长留言：{today.reason}</p>}<div className="tiny-note"><Sparkles size={14}/>每天认真一点，伙伴就长大一点。</div></section>;
  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={()=>navigate('adventure')}><img src={import.meta.env.BASE_URL+'icon.svg'} alt=""/><span>融融的宝可梦<span>英语冒险手册</span></span></button><nav aria-label="主导航">{nav.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>navigate(id)}><Icon size={18}/>{label}</button>)}</nav><div className="header-tools"><span className="cloud-state" title={'云端存档版本 '+state.revision}>{busy?<LoaderCircle className="spin" size={15}/>:<Cloud size={15}/>}<span>{busy?'保存中':pending?'待重试':'已同步'}</span></span><button className="icon-button" aria-label="设置" onClick={()=>setSettingsOpen(!settingsOpen)}><Settings2 size={19}/></button>{state.role==='parent'&&<button className={'parent-link '+(tab==='parent'?'active':'')} onClick={()=>navigate('parent')}><ShieldCheck size={17}/>家长</button>}</div></header>
    {state.contentMode==='follow'&&<div className="trial-banner" role="note"><ShieldCheck size={17}/><strong>测试账号 · 进度独立</strong><span>内容与规则自动跟随融融</span></div>}
    {settingsOpen&&<div className="settings-popover"><h3>冒险偏好</h3><label><span>游戏提示音</span><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/></label><label><span>减少动画</span><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/></label><button className="text-button" onClick={()=>{void auth.signOut();setSettingsOpen(false);}}><LogOut size={17}/>退出账号</button></div>}
    {error&&<div className="connection-banner" role="alert"><span>{error}</span><button disabled={busy} onClick={()=>pending?perform(pending):run('bootstrap')}><RefreshCw size={16}/>重试</button><button className="icon-button" aria-label="关闭提示" onClick={()=>setError('')}><X size={16}/></button></div>}
    {pending&&!error&&!busy&&<div className="connection-banner"><span>上次有一项操作尚未收到结果，重试后会核对云端记录。</span><button onClick={()=>perform(pending)}>重试未完成操作</button></div>}
    {!state.started&&!(tab==='parent'&&state.role==='parent')?<main className="starter-page"><span className="eyebrow">A NEW ADVENTURE BEGINS</span><h1>{state.nickname}，选一位伙伴吧！</h1><p>从今天起，你们一起学单词，一起认识更大的世界。</p><div className="starter-grid">{[1,4,7,25].map(id=><button className={'starter-card '+(starter===id?'selected':'')} key={id} onClick={()=>setStarter(id)}><TypeIcons types={pokemon(id).types} size={32} className="starter-types"/><img src={asset('art',id)} alt={pokemon(id).name}/><h2>{pokemon(id).name}</h2><p>{id===1?'稳稳地，陪你一点点长大':id===4?'带着小火苗，一起勇敢出发':id===7?'认真练习，也别忘了开心': '把每天的努力，变成闪亮电光'}</p><span className="choose-indicator">{starter===id?<Check size={20}/>:<Heart size={18}/>}</span></button>)}</div><button className="primary starter-confirm" disabled={busy} onClick={()=>run('starter',{speciesId:starter})}>就决定是你了，{pokemon(starter).name}！<ArrowRight size={20}/></button>{state.role==='parent'&&<button className="text-button" onClick={()=>navigate('parent')}>先去家长空间</button>}</main>:<>
      {tab==='adventure'&&<main className="adventure-page"><div className="adventure-heading"><div><span className="eyebrow"><Leaf size={13}/>关都篇 · 第 {region.requiredBadges+1} 站</span><h1>{state.nickname}，今天也一起出发吧！</h1><p>{region.description}</p></div><button className="map-open" onClick={()=>setMapOpen(true)}><Map size={22}/><span>冒险地图<small>{state.badges.length} / 8 枚徽章</small></span><ChevronRight size={17}/></button></div>
        <div className="adventure-layout"><aside className="left-rail">{renderTasks()}<section className="vocab-note"><div className="note-icon"><BookOpen size={23}/></div><div><span>今天也认识新单词</span><strong>{state.daily.questions}<small> / 10 题</small></strong></div><button onClick={()=>navigate('learning')} aria-label="打开英语练习"><ArrowRight size={21}/></button><div className="little-progress"><span style={{width:state.daily.questions*10+'%'}}/></div></section><div className="family-quote">“先试一次，再试一次，<br/>我们一直都在。”<span>— 家人们</span></div></aside>
        <section className="adventure-center">{state.battle?<Battle state={state} run={run} busy={busy} effect={effect}/>:<World state={state} busy={busy||!!pending||!!npc||mapOpen||settingsOpen} run={run} onNpc={setNpc} reduced={reduced}/>}<div className="world-footer"><span><Target size={15}/>今日野外相遇 {state.daily.encounters} / {state.settings.captureLimit}</span><span>{state.canBattle?'周末冒险开放中':'今天先练习，周末去对战'}</span><span><Cloud size={14}/>进度保存在云端</span></div></section>
        <aside className="right-rail"><div className="rail-heading"><h2>冒险小队</h2><button aria-label="管理伙伴" onClick={()=>navigate('partners')}><ChevronRight size={18}/></button></div>{state.team.map((id,index)=>{const p=state.partners.find(p=>p.id===id)!,info=pokemon(p.speciesId);return <button className={'team-mini partner-'+index} key={id} onClick={()=>navigate('partners')}><span className="mini-level">Lv.{p.level}</span><img src={asset('art',p.speciesId)} alt={info.name}/><strong>{info.name}</strong><TypeIcons types={info.types}/><div className="mini-exp"><span style={{width:(p.level>=50?100:Math.min(100,100*(p.exp-10*(p.level-1)**2)/(10*p.level**2-10*(p.level-1)**2)))+'%'}}/></div></button>;})}{state.team.length<3&&<div className="team-empty"><Heart size={22}/><span>下一位伙伴<br/>正在草丛里等你</span></div>}<div className="badge-rail"><span>一路收集的勇气</span><div>{REGIONS.map((r,i)=><span key={r.id} title={r.badge} className={state.badges.includes(r.id)?'earned':''}>{state.badges.includes(r.id)?<ShieldCheck size={18}/>:i+1}</span>)}</div></div></aside></div>
        <div className="mobile-task-panel">{renderTasks()}</div></main>}
      {tab==='partners'&&<Team state={state} run={run} busy={busy}/>}
      {tab==='pokedex'&&<Pokedex state={state}/>}
      {tab==='learning'&&<main className="page-content"><div className="section-heading"><div><span className="eyebrow">A LITTLE PRACTICE, EVERY DAY</span><h1>把单词变成冒险的力量</h1><p>每天 10 题，认真读，慢慢选。答错的词，我们再练一次。</p></div><span className="soft-tag"><BookOpen size={17}/>{state.wordCount} 个词等你认识</span></div><div className="learning-grid"><section className="practice-card"><div className="practice-art"><img src={asset('art',1)} alt="妙蛙种子陪你练习"/><span>Aa</span></div><div><span className="eyebrow">DAILY WORDS</span><h2>今天的十个小挑战</h2><div className="practice-dots">{Array.from({length:10},(_,i)=><span key={i} className={i<state.daily.questions?'done':''}>{i<state.daily.questions?<Check size={15}/>:i+1}</span>)}</div><p>首次答对 {state.daily.correct} 题 · 打卡基础经验 +{Math.round(state.daily.correct*state.settings.englishPerQuestion*100)}%</p><button className="primary" disabled={busy||state.daily.questions>=10||!!state.battle} onClick={()=>run('practice.start',{mode:'daily'})}>{state.daily.questions>=10?'今日挑战完成':state.daily.questions?'继续练习':'开始今天的练习'}<ArrowRight size={18}/></button></div></section><section className="review-practice"><BookOpen size={32}/><span className="eyebrow">MEET AGAIN</span><h2>再见一次，就更熟悉</h2><strong>{dueWords(state)}<small> 个词等待复习</small></strong><p>今天、第 1 天、第 3 天、第 7 天，和单词再打个招呼。</p><button disabled={busy||!dueWords(state)||!!state.battle} onClick={()=>run('practice.start',{mode:'review'})}>开始复习<RefreshCw size={17}/></button></section></div><div className="learning-bottom"><section className="admin-panel"><h2>我认识的单词</h2><div className="word-chips">{state.reviewWords.map(w=><Pronunciation word={w.word} className={state.mastery[w.id].due<=state.today?'due':''} key={w.id}><span className="english">{w.word}<Volume2 size={13}/></span><small>{w.meaning}</small></Pronunciation>)}{!state.reviewWords.length&&<p>完成第一道题，就把新单词收进这里。</p>}</div></section>{renderTasks()}</div></main>}
      {tab==='parent'&&(state.role==='parent'?<Parent state={state} run={run} busy={busy}/>:<div className="empty-state"><Lock size={38}/><h2>这里需要家长账号</h2><p>请让家长在自己的设备登录。</p><button onClick={()=>navigate('adventure')}>回到冒险</button></div>)}
    </>}
    {npc&&<div className="modal-scrim npc-scrim"><section className="npc-dialog"><div className="npc-portrait"><UsersAvatar kind={npc.kind}/></div><div><span className="eyebrow">{npc.kind==='family'?'一直陪在你身边':'一起冒险的朋友'}</span><h2>{npc.name}</h2><p>{npc.line}</p>{NPC_GIFTS.filter(g=>g.npcId===npc.id&&!state.caught.includes(g.speciesId)).map(g=><p className="npc-completed" key={g.speciesId}><Sparkles size={16}/>{state.badges.length>=g.badges?'完成小挑战，领取'+pokemon(g.speciesId).name+'的收藏赠礼':'集齐 '+g.badges+' 枚徽章后，'+pokemon(g.speciesId).name+'会来做朋友。'}</p>)}{state.npcCompleted.includes(state.today+':'+npc.id)&&<p className="npc-completed"><Check size={16}/>今天的小挑战已经完成啦！</p>}<div className="npc-dialog-actions"><button className="primary" disabled={busy} onClick={async()=>{const result=await run('npc.challenge',{npcId:npc.id});if(result?.ok)setNpc(null);}}><BookOpen size={17}/>{npc.quest}</button><button onClick={()=>setNpc(null)}>一会儿见！</button></div></div></section></div>}
    {mapOpen&&<div className="modal-scrim"><section className="dialog world-map-dialog"><button className="close" aria-label="关闭地图" onClick={()=>setMapOpen(false)}><X/></button><span className="eyebrow">KANTO ADVENTURE</span><h2>每一站，都有新的朋友</h2><div className="region-path">{REGIONS.map((r,i)=>{const unlocked=state.badges.length>=r.requiredBadges;return <button disabled={!unlocked||busy||!!state.battle} key={r.id} className={(unlocked?'unlocked':'locked')+(r.id===region.id?' current':'')} onClick={async()=>{const result=await run('world.position',{regionId:r.id,x:19,y:18});if(result?.ok)setMapOpen(false);}}><span className="region-number" style={{background:r.color}}>{unlocked?<Flag size={22}/>:<Lock size={20}/>}</span><div><small>第 {i+1} 站</small><strong>{r.name}</strong><p>{r.badge} · 推荐 Lv.{r.level}</p></div>{state.badges.includes(r.id)&&<ShieldCheck size={23}/>}</button>;})}</div></section></div>}
    {(state.question||feedback)&&tab!=='parent'&&<Quiz question={state.question} feedback={feedback} pending={!!pending} dismiss={()=>setFeedback(null)} run={run} busy={busy} sound={sound} error={error} retry={()=>{void (pending?perform(pending):run('bootstrap'));}}/>}
    {notice&&<div className={'toast '+effect} role="status"><Sparkles size={20}/><span>{notice}</span><button aria-label="关闭消息" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <footer className="app-footer"><span>融融的冒险手册 · 关都篇</span><a href={import.meta.env.BASE_URL+'audio-credits.html'} target="_blank" rel="noreferrer">单词音频来源</a><span>v{version}</span></footer>
  </div>;
}
function UsersAvatar({kind}:{kind:string}){return <div className={'drawn-avatar '+kind}><i/><b/><span/></div>;}
function Login({error,onError}:{error:string;onError:(value:string)=>void}){
  const [username,setUsername]=useState(pageFromHash()==='parent'?'rongrong-parent':'rongrong'),[password,setPassword]=useState(''),[loading,setLoading]=useState(false);
  async function login(e:React.FormEvent){e.preventDefault();setLoading(true);onError('');try{const result=await auth.signInWithPassword({username:username.trim(),password});if(result.error)throw new Error(result.error.message);if(!result.data?.session)throw new Error('没有建立登录会话，请重试');}catch(e){onError(e instanceof Error?e.message:'暂时登录不上');}finally{setLoading(false);}}
  return <div className="login-page"><header className="login-brand"><img src={import.meta.env.BASE_URL+'icon.svg'} alt=""/><span>融融的宝可梦<span>英语冒险手册</span></span><small>专属于我们的小世界</small></header><main className="login-layout"><section className="login-story"><span className="eyebrow"><Leaf size={16}/>第一章 · 关都的风</span><h1>融融，<br/>下一站是<span>冒险！<svg viewBox="0 0 350 18"><path d="M3 13Q170-4 345 10" fill="none" stroke="#ffd45a" strokeWidth="9" strokeLinecap="round"/></svg></span></h1><p>做完今天的小任务，<br/>带上宝可梦伙伴，一起学英语、去探索。</p><div className="login-badges"><span><Compass size={17}/>8 个冒险区域</span><span><BookOpen size={17}/>151 位宝可梦伙伴</span></div><div className="hero-illustration"><div className="hero-sun"/><div className="hero-hill hill-back"/><div className="hero-hill hill-front"/><div className="hero-dots"/><img className="hero-pikachu" src={asset('art',25)} alt="皮卡丘等待与你一起冒险"/><img className="hero-bulbasaur" src={asset('art',1)} alt="妙蛙种子"/><img className="hero-squirtle" src={asset('art',7)} alt="杰尼龟"/><span className="hero-note"><Sparkles size={17}/>今天，也会有新发现。</span></div></section><section className="login-form-panel"><span className="paper-tape"/><div className="login-stamp"><Compass size={32}/></div><span className="eyebrow">WELCOME HOME, TRAINER</span><h2>打开我们的冒险手册</h2><p>使用家长准备好的家庭账号登录。</p><form onSubmit={login}><label>账号<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>密码<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="primary login-submit" disabled={loading}>{loading?<LoaderCircle className="spin" size={19}/>:<Compass size={19}/>}进入冒险<ArrowRight size={18}/></button></form><div className="login-switch"><button onClick={()=>{setUsername('rongrong');setPassword('');location.hash='/adventure';}}>我是融融</button><span>·</span><button onClick={()=>{setUsername('rongrong-parent');setPassword('');location.hash='/parent';}}>我是家长</button></div><div className="login-footnote"><Cloud size={17}/><span>成长进度存在云端，<br/>换一台设备，也能接着冒险。</span></div></section></main><footer>为融融和家人准备的宝可梦同人学习网站 · 家庭自用</footer></div>;
}
