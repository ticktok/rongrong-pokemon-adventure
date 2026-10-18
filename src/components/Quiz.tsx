import {useEffect} from 'react';
import {BookOpen,Volume2,Sparkles,Lightbulb} from 'lucide-react';
import type {PublicQuestion} from '../game/types';
import type {Run} from '../lib';
import {speak} from '../lib';
export default function Quiz({question:q,run,busy,sound}:{question:PublicQuestion;run:Run;busy:boolean;sound:boolean}){
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{const i=Number(e.key)-1;if(i>=0&&i<q.options.length&&!busy){e.preventDefault();void run('answer',{questionId:q.id,optionId:q.options[i].id});}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[q.id,q.options,busy,run]);
  const word=q.word??q.prompt.match(/“([A-Za-z -]+)”/)?.[1];
  return <div className="modal-scrim quiz-scrim"><section role="dialog" aria-modal="true" aria-labelledby="quiz-title" className={'quiz-dialog '+(q.wrong?'wrong':'')}>
    <div className="quiz-eyebrow"><span><BookOpen size={17}/>{q.kind==='battle'?'招式助攻':q.kind==='catch'?'捕捉助攻':q.kind==='review'?'复习小站':'单词小挑战'}</span><span className="quiz-bonus"><Sparkles size={15}/>{q.wrong?'纠正后继续':q.kind==='battle'?'首答正确 · 威力提升':q.kind==='catch'?'首答正确 · 更容易捕捉':'读一读，再选一选'}</span></div>
    <h2 id="quiz-title">{q.prompt}</h2>
    {word&&<button className="pronounce" onClick={()=>speak(word,true)}><Volume2 size={18}/>听单词{!sound&&<small>（点击播放）</small>}</button>}
    {q.wrong&&<div className="word-explanation"><Lightbulb size={24}/><div><strong>再认一次，就记住了</strong><p>{q.explanation}</p><small>{q.example}</small></div></div>}
    <div className="quiz-options">{q.options.map((o,i)=><button key={o.id} disabled={busy} onClick={()=>run('answer',{questionId:q.id,optionId:o.id})}><span>{i+1}</span><b>{o.text}</b></button>)}</div>
    <p className="quiz-footer">{q.wrong?'这次仍会正常行动。选对以后，我们继续冒险。':'可以按数字键 1—4 选择，也可以直接点按钮。'}</p>
  </section></div>;
}
