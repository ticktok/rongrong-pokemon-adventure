import {useEffect,useRef} from 'react';
import {BookOpen,Sparkles,Lightbulb,Check,ArrowRight} from 'lucide-react';
import type {PublicQuestion,DailyFeedback} from '../game/types';
import type {Run} from '../lib';
import Pronunciation from './Pronunciation';
import {stopPronunciation} from '../pronunciation';
export default function Quiz({question:q,feedback,run,busy,pending,sound,error,retry,dismiss}:{question:PublicQuestion|null;feedback:DailyFeedback|null;run:Run;busy:boolean;pending:boolean;sound:boolean;error:string;retry:()=>void;dismiss:()=>void}){
  const dialog=useRef<HTMLElement>(null),identity=q?.id??feedback?.questionId;
  useEffect(()=>{stopPronunciation();dialog.current?.querySelector<HTMLButtonElement>(q?'.quiz-options button':'.quiz-complete-actions .primary')?.focus();return stopPronunciation;},[identity,!!q]);
  useEffect(()=>{if(!q)return;const handler=(e:KeyboardEvent)=>{const i=Number(e.key)-1;if(i>=0&&i<q.options.length&&!busy&&!pending&&!e.repeat){e.preventDefault();void run('answer',{questionId:q.id,optionId:q.options[i].id});}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[q,busy,pending,run]);
  const word=q?(q.word??q.prompt.match(/“([A-Za-z -]+)”/)?.[1]):feedback?.word;
  const complete=!q&&feedback,goal=feedback?.goal??10,finished=complete&&feedback.completed>=goal;
  return <div className="modal-scrim quiz-scrim"><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="quiz-title" className={'quiz-dialog '+(q?.wrong?'wrong':'')}>
    <div className="quiz-eyebrow"><span><BookOpen size={17}/>{q?.kind==='battle'?'招式助攻':q?.kind==='catch'?'捕捉助攻':q?.kind==='review'?'复习小站':'单词小挑战'}</span><span className="quiz-bonus"><Sparkles size={15}/>{complete?feedback.completed+' / '+goal:q?.wrong?'纠正后继续':q?.kind==='battle'?'首答正确 · 威力提升':q?.kind==='catch'?'首答正确 · 更容易捕捉':'读一读，再选一选'}</span></div>
    <h2 id="quiz-title">{q?.prompt??(finished?(goal===10?'今天的十个小挑战完成啦！':'今天的 '+goal+' 个小挑战完成啦！'):'答对了，把这个词记住啦！')}</h2>
    {word&&<Pronunciation word={word}/>}
    {!sound&&word&&<small className="audio-hint">点击仍可听单词</small>}
    {q?.wrong&&<div className="word-explanation" role="status"><Lightbulb size={24}/><div><strong>再认一次，就记住了</strong><p>{q.explanation}</p><small>{q.example}</small></div></div>}
    {q&&<><div className="quiz-options">{q.options.map((o,i)=><button key={o.id} disabled={busy||pending} onClick={()=>run('answer',{questionId:q.id,optionId:o.id})}><span>{i+1}</span><b>{o.text}</b></button>)}</div><p className="quiz-footer">{q.wrong?'这次仍会正常行动。选对以后，我们继续冒险。':'可以按数字键 1—4 选择，也可以直接点按钮。'}</p></>}
    {complete&&<><div className="word-explanation quiz-success" role="status"><Check size={24}/><div><strong>再读一遍</strong><p>{feedback.explanation}</p><small>{feedback.example}</small></div></div><p className="quiz-summary">已完成 {feedback.completed} / {goal} 题 · 首次答对 {feedback.correct} 题{finished?'。已通过任务会自动补足英语加成，其余等待家长确认。':''}</p>{feedback.rewardMessage&&<p className="quiz-reward" role="status">{feedback.rewardMessage}</p>}<div className="quiz-complete-actions"><button className="primary" disabled={busy||pending} onClick={()=>{if(finished)dismiss();else void run('practice.start',{mode:'daily'});}}>{finished?'完成挑战':'下一题'}<ArrowRight size={18}/></button>{!finished&&<button disabled={busy||pending} onClick={dismiss}>稍后继续</button>}</div></>}
    {error&&<div className="quiz-retry" role="alert"><p>{error}</p><button disabled={busy} onClick={retry}>重试这一步</button></div>}
  </section></div>;
}
