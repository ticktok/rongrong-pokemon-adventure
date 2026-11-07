import {useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
export default function Dialog({title,onClose,children,className='',error='',retry}:{title:string;onClose:()=>void;children:ReactNode;className?:string;error?:string;retry?:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const dialog=ref.current!,previous=document.activeElement;dialog.showModal();return()=>{dialog.close();if(previous instanceof HTMLElement)previous.focus();};},[]);
 return <dialog ref={ref} className={'native-dialog '+className} aria-label={title} onCancel={e=>{e.preventDefault();close.current();}}><button className="close" aria-label="关闭" onClick={onClose}><X/></button><h2>{title}</h2>{children}{error&&<div className="dialog-error" role="alert"><p>{error}</p>{retry&&<button onClick={retry}>重试</button>}</div>}</dialog>;
}
