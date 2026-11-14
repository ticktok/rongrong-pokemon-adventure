import {useEffect,useState} from 'react';
import {Lock,ShieldCheck,Save} from 'lucide-react';
import type {PublicState} from '../game/types';
import type {Run} from '../lib';

export default function ParentControls({state,run,busy}:{state:PublicState;run:Run;busy:boolean}){
  const difficulty=state.settings.gymDifficulty??1.5;
  const [draft,setDraft]=useState(difficulty);
  useEffect(()=>setDraft(difficulty),[difficulty]);
  const readOnly=state.contentMode==='follow';
  const retryReason=state.battle?.status==='active'?'先完成正在进行的战斗':state.question?'先完成当前题目':state.gymRemaining>0?'还有未使用的挑战机会':'';
  return <section className="admin-panel parent-controls" aria-label="儿童端与道馆控制">
    <h2><ShieldCheck size={21}/> 冒险节奏</h2>
    <label className="toggle-row"><span><Lock size={17}/> 锁定儿童端<small>{state.settings.childLocked?'儿童端已暂停，关闭开关后可继续':'开启后暂停整个儿童端，保留当前题目与战斗'}</small></span><input type="checkbox" checked={state.settings.childLocked??false} disabled={busy||readOnly} onChange={e=>void run('parent.settings',{childLocked:e.target.checked})}/></label>
    <div className="gym-difficulty"><label htmlFor="gym-difficulty">道馆难度系数 <strong>{draft.toFixed(1)} 倍</strong></label><input id="gym-difficulty" type="range" min="0.5" max="3" step="0.1" value={draft} disabled={busy||readOnly} onChange={e=>setDraft(Number(e.target.value))}/><div className="difficulty-scale"><span>0.5 · 轻松</span><span>1.5 · 默认</span><span>3.0 · 挑战</span></div><p>同时调整道馆对手的体力和伤害。1.0 为原有难度，下一场道馆生效。</p><button className="primary" disabled={busy||readOnly||draft===difficulty} onClick={()=>void run('parent.settings',{gymDifficulty:draft})}><Save size={17}/>保存难度</button></div>
    <div className="gym-retry"><h3>今天的道馆挑战</h3><p>剩余 <strong>{state.gymRemaining}</strong> 次 · {state.today}</p><button disabled={busy||!!retryReason} onClick={()=>void run('parent.gym.retry')}>今天再给一次挑战机会</button><small>{retryReason||'补充一次当天有效的机会；用完后可由家长再次补充。'}</small><small>仍需满足区域开放条件；工作日请同时开启临时对战放行。</small></div>
    {readOnly&&<p>锁定和难度自动跟随融融，仅供查看；补充挑战机会只影响本测试家庭。</p>}
  </section>;
}
