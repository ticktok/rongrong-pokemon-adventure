import {useEffect,useState} from 'react';
import {ArrowRight,Check,Sun,Sparkles} from 'lucide-react';
import type {CheckinTask,PublicState} from '../game/types';
import {checkinTasks,checkinStatusLabels,taskStatusLabels} from '../game/checkins';
import type {Run} from '../lib';

export default function DailyTasks({state,run,busy}:{state:PublicState;run:Run;busy:boolean}){
  const today=state.checkins.find(c=>c.date===state.today),[selected,setSelected]=useState<string[]>([]);
  const tasks:CheckinTask[]=today?.review||today&&today.status!=='rejected'?checkinTasks(today!,state.settings):state.settings.tasks.filter(t=>t.active).map(t=>({...t,status:today?.taskIds.includes(t.id)?'rejected':'unsubmitted',reason:today?.taskIds.includes(t.id)?today.reason:undefined}));
  const waiting=tasks.some(t=>t.status==='pending'),approved=tasks.filter(t=>t.status==='approved').length;
  const selectedIds=selected.filter(id=>tasks.some(t=>t.id===id&&(t.status==='unsubmitted'||t.status==='rejected')));
  useEffect(()=>{setSelected([]);},[state.today,today?.submittedAt,today?.reviewedAt,today?.review?.submissionVersion,today?.status]);
  return <section className="paper-panel daily-tasks"><span className="paper-tape"/><div className="eyebrow">TODAY'S LITTLE STEPS</div><h2>今天的小目标<Sun size={20}/></h2><p>{approved?`已经通过 ${approved} / ${tasks.length} 项，继续完成剩下的小目标。`:'认真做好，再把努力记下来。'}</p>
    <div className="task-list">{tasks.map(t=><div className={'task-item task-'+t.status} key={t.id}><label><input type="checkbox" disabled={busy||waiting||t.status==='approved'} checked={t.status==='approved'||t.status==='pending'||selectedIds.includes(t.id)} onChange={()=>setSelected(previous=>previous.includes(t.id)?previous.filter(id=>id!==t.id):[...previous,t.id])}/><span>{t.name}</span><small>{taskStatusLabels[t.status]}</small><Check size={14}/></label>{t.status==='rejected'&&t.reason&&<p className="task-feedback">家长留言：{t.reason}</p>}</div>)}</div>
    <button className="primary full" disabled={busy||waiting||!selectedIds.length} onClick={()=>run('checkin.submit',{taskIds:selectedIds,date:state.today})}>{waiting?'等待家长确认':today?.status==='approved'?'今天的努力已收到':selectedIds.length?`提交 ${selectedIds.length} 项任务`:'完成啦，提交打卡'}<ArrowRight size={16}/></button>
    <div className="tiny-note"><Sparkles size={14}/>通过的任务会保留，补做请在今天提交。</div>
    {!!state.checkins.filter(c=>c.date!==state.today).length&&<details className="child-task-history"><summary>以前的打卡</summary>{[...state.checkins].filter(c=>c.date!==state.today).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7).map(c=><div key={c.date}><b>{c.date} · {checkinStatusLabels[c.status]}</b><span>历史记录仅供查看</span>{checkinTasks(c,state.settings).map(t=><p key={t.id}>{t.name} · {taskStatusLabels[t.status]}{t.reason?'：'+t.reason:''}</p>)}</div>)}</details>}
  </section>;
}
