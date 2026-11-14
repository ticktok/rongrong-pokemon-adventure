let context:AudioContext|undefined;
export function stopEffects(){const previous=context;context=undefined;if(previous)void previous.close().catch(error=>console.warn('提示音停止失败',error.message));}
export function prepareAudio(){
  const Constructor=window.AudioContext;
  if(!Constructor)return;
  context??=new Constructor();
  if(context.state==='suspended')void context.resume().catch(error=>console.warn('提示音暂不可用',error.message));
}
export function playEffect(effect:string,enabled:boolean){
  if(!enabled||!context||context.state!=='running')return;
  const notes=effect==='wrong'?[330,294]:['win','gift','catch','evolve','level'].includes(effect)?[523,659,784,1047]:effect==='attack'?[392,523]:[659,784];
  for(let i=0;i<notes.length;i++){
    const oscillator=context.createOscillator(),gain=context.createGain(),time=context.currentTime+i*0.12;
    oscillator.type='sine';oscillator.frequency.value=notes[i];gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(0.045,time+0.015);gain.gain.exponentialRampToValueAtTime(0.001,time+0.18);
    oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+0.2);
  }
}

export function playMoveEffect(type:string,enabled:boolean){
 if(!enabled||!context||context.state!=='running')return;
 const tones:Record<string,number>={fire:130,water:310,grass:230,electric:760,ice:640,fighting:95,poison:175,ground:70,flying:420,psychic:520,bug:370,rock:85,ghost:155,dragon:200,dark:110,steel:880,fairy:690,normal:260};
 const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
 oscillator.type=['electric','steel'].includes(type)?'triangle':['fire','ground','rock'].includes(type)?'sawtooth':'sine';
 oscillator.frequency.setValueAtTime(tones[type]??260,now);oscillator.frequency.exponentialRampToValueAtTime((tones[type]??260)*1.7,now+.2);oscillator.frequency.exponentialRampToValueAtTime(80,now+.55);
 gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.035,now+.03);gain.gain.exponentialRampToValueAtTime(.001,now+.6);
 oscillator.connect(gain);gain.connect(context.destination);oscillator.start(now);oscillator.stop(now+.65);
}
