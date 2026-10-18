let context:AudioContext|undefined;
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
