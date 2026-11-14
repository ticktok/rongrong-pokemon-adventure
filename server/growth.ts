import type {GameState,Role} from '../src/game/types';

/** Compare actual delivered progress, including rollover, without reconstructing past rewards. */
export function recordGrowth(before:GameState,after:GameState,at:string){
  const previous=new Map(before.partners.map(p=>[p.id,p]));
  for(const partner of after.partners){
    const old=previous.get(partner.id);
    if(!old||!(partner.exp>old.exp||partner.level>old.level||partner.speciesId!==old.speciesId))continue;
    const history=after.growth??={lastSeq:0,readThrough:0,entries:[]};
    history.entries.push({seq:++history.lastSeq,at,partnerId:partner.id,fromSpecies:old.speciesId,toSpecies:partner.speciesId,fromExp:old.exp,toExp:partner.exp,fromLevel:old.level,toLevel:partner.level});
  }
}

export function acknowledgeGrowth(state:GameState,through:unknown,role:Role){
  if(role!=='child')throw new Error('请让小训练师亲自查看成长提醒');
  const history=state.growth;
  if(typeof through!=='number'||!Number.isSafeInteger(through)||through<0||through>(history?.lastSeq??0))throw new Error('成长记录已更新，请刷新后重试');
  if(!history)return;
  history.readThrough=Math.max(history.readThrough,through);
  const read=history.entries.filter(e=>e.seq<=history.readThrough).slice(-80);
  history.entries=[...read,...history.entries.filter(e=>e.seq>history.readThrough)];
}
