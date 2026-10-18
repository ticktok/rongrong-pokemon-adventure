import { MOVES } from '../content/world';
import {STARTERS,NPC_GIFTS} from '../content/packs';
import {isWalkable} from '../content/geometry';
import type { GameState, GameCommand, ActionResult, Role, Word, Npc, Question, Partner } from '../src/game/types';
import { species, region, hp, damage, captureChance, wildPool, availableMoves, defaultMoves, EVOLUTIONS, wordsFor,wordBank,sameLineage } from './game-data';
import { dayOf, isWeekend, rollover, canBattle, grant, makePartner, addEvent, streak, updateSeals, type Runtime } from './state';
import { makeQuestion, recordFirst } from './quiz';
const text=(p:Record<string,unknown>,key:string,max=200)=>{const v=p[key];if(typeof v!=='string'||!v.trim().length||v.length>max)throw new Error('请检查填写内容');return v.trim();};
const number=(p:Record<string,unknown>,key:string,min:number,max:number)=>{const v=p[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('数值超出可用范围');return v;};
const ids=(p:Record<string,unknown>,key:string,max=20)=>{const v=p[key];if(!Array.isArray(v)||v.length>max||!v.every(x=>typeof x==='string'))throw new Error('请选择有效项目');return [...new Set(v)] as string[];};
function requireParent(role:Role){if(role!=='parent')throw new Error('这项操作需要家长登录');}
function noQuestion(s:GameState){if(s.question)throw new Error('先完成眼前这道题，再继续吧');}
function noBattle(s:GameState){if(s.battle?.status==='active')throw new Error('先完成这场冒险，再做这件事吧');}
function current(s:GameState):Partner { const p=s.partners.find(p=>p.id===s.battle?.playerId);if(!p)throw new Error('请先选择出战伙伴');return p; }
function addCaught(s:GameState,id:number){if(!s.caught.includes(id))s.caught.push(id);if(!s.seen.includes(id))s.seen.push(id);}
function log(s:GameState,message:string){if(s.battle)s.battle.log=[...s.battle.log,message].slice(-12);}
function startBattle(s:GameState,kind:'wild'|'gym',rt:Runtime):ActionResult {
  noQuestion(s);noBattle(s);
  if(!s.started||!s.team.length)throw new Error('先邀请一位宝可梦伙伴吧');
  if(!canBattle(s,dayOf(rt.now)))throw new Error('对战与捕捉周末开放，也可以请家长临时放行');
  const r=region(s.position.regionId);
  if(s.badges.length<r.requiredBadges)throw new Error('先获得上一座道馆的徽章吧');
  let enemy:number,level:number,enemies:number[];
  if(kind==='wild'){
    if(s.daily.encounters>=s.settings.captureLimit)throw new Error('今天的捕捉冒险已完成，下次再来看看吧');
    const pool=wildPool(r.id).flatMap(p=>Array(s.caught.includes(p.id)?1:5).fill(p.id) as number[]);
    enemy=pool[Math.floor(rt.random()*pool.length)];level=Math.max(3,r.level-4+Math.floor(rt.random()*3));enemies=[enemy];
    s.daily.encounters++;
  }else{enemy=r.boss[0];level=r.level;enemies=r.boss;}
  const team=s.partners.filter(p=>s.team.includes(p.id)&&!p.sealed);
  if(!team.length)throw new Error('出战伙伴还没有准备好');
  const p=team[0],ph=hp(p.speciesId,p.level),eh=hp(enemy,level);
  s.battle={id:rt.uuid(),kind,regionId:r.id,enemy,enemyLevel:level,enemyHp:eh,enemyMaxHp:eh,playerId:p.id,playerHp:ph,playerMaxHp:ph,teamHp:Object.fromEntries(team.map(p=>[p.id,hp(p.speciesId,p.level)])),enemyIndex:0,enemies,combo:0,balls:0,turn:1,log:[kind==='gym'?r.leader+'：准备好了吗？一起认真打一场！':'野生的'+species(enemy).name+'出现了！'],status:'active'};
  if(!s.seen.includes(enemy))s.seen.push(enemy);
  return {message:kind==='wild'?'草丛里的新朋友出现了！':'道馆挑战开始了'};
}
function enemyTurn(s:GameState):ActionResult|undefined {
  const b=s.battle!;const p=current(s);
  const move=defaultMoves(b.enemy,b.enemyLevel).sort((a,c)=>damage(b.enemy,b.enemyLevel,p.speciesId,p.level,c)-damage(b.enemy,b.enemyLevel,p.speciesId,p.level,a))[0];
  const n=damage(b.enemy,b.enemyLevel,p.speciesId,p.level,move);
  b.playerHp=Math.max(0,b.playerHp-n);b.teamHp[p.id]=b.playerHp;b.turn++;
  log(s,species(b.enemy).name+'使用'+MOVES.find(m=>m.id===move)!.name+'，造成 '+n+' 点伤害。');
  if(b.playerHp===0){
    const next=s.partners.find(p=>s.team.includes(p.id)&&(b.teamHp[p.id]??0)>0);
    if(next){b.playerId=next.id;b.playerHp=b.teamHp[next.id];b.playerMaxHp=hp(next.speciesId,next.level);log(s,species(next.speciesId).name+'接力上场！');}
    else{b.status='lost';return {message:'伙伴需要休息。我们整理一下，下次再来！',effect:'lose'};}
  }
}
function win(s:GameState,rt:Runtime):ActionResult {
  const b=s.battle!,r=region(b.regionId);b.status='won';
  if(b.kind==='gym'&&!s.badges.includes(r.id)){
    s.badges.push(r.id);
    const gift=makePartner(r.gift,r.level,rt);gift.sealed=s.settings.sealDays;s.partners.push(gift);addCaught(s,r.gift);
    const message='获得'+r.badge+'！'+species(r.gift).name+'也来了，坚持打卡唤醒它吧。';
    addEvent(s,rt,message);return {message,effect:'gift'};
  }
  return {message:b.kind==='wild'?'你的伙伴赢了！这次冒险真勇敢。':'挑战成功，你们配合得越来越好了！',effect:'win'};
}
function settleAction(s:GameState,q:Question,firstCorrect:boolean,rt:Runtime):ActionResult {
  const b=s.battle;
  if(!b||b.status!=='active')throw new Error('这场冒险已结束');
  if(q.kind==='catch'){
    b.balls++;
    const chance=captureChance(b.enemy,b.enemyHp,b.enemyMaxHp,firstCorrect?s.settings.catchBonus:0);
    if(rt.random()<chance){
      b.status='caught';addCaught(s,b.enemy);
      const duplicate=s.partners.find(p=>p.speciesId===b.enemy&&!p.sealed)??s.partners.find(p=>sameLineage(p.speciesId,b.enemy)&&!p.sealed);
      let message:string;
      if(duplicate){const gained=grant(s,80,[duplicate.id]);message='又遇见了同一家族的伙伴！为'+species(duplicate.speciesId).name+'带来 '+gained+' 经验，其余奖励按每日上限顺延。';}
      else{const p=makePartner(b.enemy,b.enemyLevel,rt);s.partners.push(p);if(s.team.length<3)s.team.push(p.id);message='捕捉成功！'+species(b.enemy).name+'加入了你的冒险。';}
      addEvent(s,rt,message);return {message,effect:'catch'};
    }
    log(s,species(b.enemy).name+'跳出了精灵球。');
    if(b.balls>=3){b.status='fled';return {message:'它回到草丛里了。今天的相遇已经记进图鉴。'};}
    return enemyTurn(s)??{message:'差一点点！降低它的体力，再试一次。',effect:'attack'};
  }
  const p=current(s),move=q.moveId!;
  b.combo=firstCorrect?b.combo+1:0;
  const bonus=firstCorrect?(b.combo===3?s.settings.comboBonus:s.settings.attackBonus):1;
  if(b.combo===3)b.combo=0;
  const n=damage(p.speciesId,p.level,b.enemy,b.enemyLevel,move,bonus);
  b.enemyHp=Math.max(0,b.enemyHp-n);
  log(s,species(p.speciesId).name+'使用'+MOVES.find(m=>m.id===move)!.name+'，造成 '+n+' 点伤害'+(bonus>1?'（英语助攻）':'')+'。');
  if(b.enemyHp===0){
    if(b.enemyIndex+1<b.enemies.length){
      b.enemyIndex++;b.enemy=b.enemies[b.enemyIndex];b.enemyMaxHp=hp(b.enemy,b.enemyLevel);b.enemyHp=b.enemyMaxHp;
      if(!s.seen.includes(b.enemy))s.seen.push(b.enemy);
      log(s,'下一位对手：'+species(b.enemy).name+'！');
      return {message:'漂亮！下一位对手上场了。',effect:'attack'};
    }
    return win(s,rt);
  }
  return enemyTurn(s)??{message:n===0?'单词记住了！这个属性对对手无效，换一个招式试试。':bonus>1?'英语助攻！伙伴的招式更有力量了。':'单词记住了，伙伴使出了普通招式。',effect:'attack'};
}
function answer(s:GameState,p:Record<string,unknown>,rt:Runtime):ActionResult {
  const q=s.question;
  if(!q||q.id!==text(p,'questionId'))throw new Error('题目已更新，请刷新后继续');
  const optionId=text(p,'optionId');
  if(!q.options.some(o=>o.id===optionId))throw new Error('请选择题目中的选项');
  const correct=optionId===q.correctOptionId;
  if(!q.wrong)recordFirst(s,q,correct,rt);
  if(!correct){q.wrong=true;q.firstCorrect=false;return {message:'差一点，看看提示。记住这个单词，再选一次吧。',effect:'wrong'};}
  const firstCorrect=!q.wrong;s.question=null;
  if(q.kind==='battle'||q.kind==='catch')return settleAction(s,q,firstCorrect,rt);
  if(q.kind==='daily'){
    s.daily.questions++;s.daily.completedIds.push(q.wordId);if(firstCorrect)s.daily.correct++;
    s.daily.practiceFinished=s.daily.questions>=10;
    return {message:s.daily.practiceFinished?'今日 10 题完成！首次答对 '+s.daily.correct+' 题，提交打卡后等家长发放奖励。':'记住了！今日进度 '+s.daily.questions+' / 10。',effect:'correct'};
  }
  if(q.kind==='npc'&&q.npcId){
    const key=dayOf(rt.now)+':'+q.npcId;if(!s.npcCompleted.includes(key))s.npcCompleted.push(key);s.npcCompleted=s.npcCompleted.slice(-400);
    const gift=NPC_GIFTS.find(g=>g.npcId===q.npcId&&s.badges.length>=g.badges&&!s.caught.includes(g.speciesId));
    if(gift){const partner=makePartner(gift.speciesId,gift.level,rt);s.partners.push(partner);addCaught(s,gift.speciesId);const message=species(gift.speciesId).name+'带着家人的鼓励加入了队伍！';addEvent(s,rt,message);return {message,effect:'gift'};}
  }
  return {message:'记住这个词了，下次遇见它试着自己读出来！',effect:'correct'};
}
export function execute(input:GameState,cmd:GameCommand,role:Role,rt:Runtime):{state:GameState;result:ActionResult}{
  const s=structuredClone(input);rollover(s,rt);const p=cmd.payload,day=dayOf(rt.now);
  let result:ActionResult={message:''};
  if(cmd.type.startsWith('parent.'))requireParent(role);
  switch(cmd.type){
    case 'bootstrap':break;
    case 'starter':{
      if(s.started)throw new Error('已经拥有初始伙伴了');
      const id=number(p,'speciesId',1,100000);if(!STARTERS.includes(id))throw new Error('请选择初始伙伴之一');
      const partner=makePartner(id,5,rt);s.partners.push(partner);s.team=[partner.id];s.started=true;addCaught(s,id);
      result={message:species(id).name+'决定和你一起冒险！',effect:'gift'};addEvent(s,rt,result.message);break;
    }
    case 'practice.start':{
      noQuestion(s);noBattle(s);
      const mode=p.mode==='review'?'review':'daily';
      if(mode==='daily'&&s.daily.questions>=10)throw new Error('今天的 10 题已完成，可以去复习单词');
      s.question=makeQuestion(s,mode,rt);break;
    }
    case 'npc.challenge':{
      noQuestion(s);noBattle(s);const npc=s.npcs.find(n=>n.id===text(p,'npcId'));
      if(!npc||npc.regionId!==s.position.regionId)throw new Error('先走到这位朋友身边吧');
      s.question=makeQuestion(s,'npc',rt,{npcId:npc.id});break;
    }
    case 'answer':result=answer(s,p,rt);break;
    case 'checkin.submit':{
      if(!s.started)throw new Error('先选择初始伙伴吧');
      const taskIds=ids(p,'taskIds');
      if(!taskIds.length||taskIds.some(id=>!s.settings.tasks.some(t=>t.id===id&&t.active)))throw new Error('勾选今天实际完成的任务吧');
      const existing=s.checkins.find(c=>c.date===day);
      if(existing&&existing.status!=='rejected')throw new Error('今天已经提交过了');
      if(existing)s.checkins=s.checkins.filter(c=>c!==existing);
      s.checkins.push({date:day,taskIds,status:'pending',submittedAt:rt.now.toISOString(),englishCorrect:s.daily.correct,granted:0});
      result={message:'已送给家长，等待确认。你今天的努力已经记下来了！'};break;
    }
    case 'parent.review':{
      const c=s.checkins.find(c=>c.date===text(p,'date'));
      if(!c||c.status!=='pending')throw new Error('这条打卡已处理，请刷新查看');
      if(p.approve!==true){c.status='rejected';c.reason=typeof p.reason==='string'?p.reason.slice(0,200):'请补充完成后重新提交';result={message:'已退回，孩子可以补充后重新提交'};break;}
      c.status='approved';c.reviewedAt=rt.now.toISOString();
      const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(c.submittedAt));
      const quick=!isWeekend(c.date)&&localTime<=s.settings.fastDeadline;
      const bonus=Math.round(s.settings.baseExp*s.settings.englishPerQuestion*c.englishCorrect);
      const total=s.settings.baseExp+bonus+(quick?Math.round(s.settings.baseExp*(s.settings.fastMultiplier-1)):0)+(streak(s,c.date)%7===0?s.settings.streakBonus:0);
      const old=s.partners.map(p=>p.level);c.granted=grant(s,total);updateSeals(s,c.date,rt);
      result={message:'打卡通过！发放 '+c.granted+' 经验'+(total>c.granted?'，其余 '+(total-c.granted)+' 顺延':'')+'。',effect:s.partners.some((p,i)=>p.level>old[i])?'level':'approve'};
      addEvent(s,rt,result.message);break;
    }
    case 'world.position':{
      noBattle(s);noQuestion(s);
      const id=text(p,'regionId'),r=region(id);if(s.badges.length<r.requiredBadges)throw new Error('先获得上一座道馆的徽章吧');
      const x=Math.round(number(p,'x',1,38)),y=Math.round(number(p,'y',1,24));
      if(!isWalkable(x,y,r.biome))throw new Error('这里暂时无法停留，请选择附近的空地');
      s.position={regionId:id,x,y};break;
    }
    case 'encounter':result=startBattle(s,'wild',rt);break;
    case 'gym.start':result=startBattle(s,'gym',rt);break;
    case 'battle.move':{
      noQuestion(s);const b=s.battle;if(!b||b.status!=='active')throw new Error('没有进行中的对战');
      const moveId=text(p,'moveId');if(!current(s).moves.includes(moveId))throw new Error('伙伴还没有装备这个招式');
      s.question=makeQuestion(s,'battle',rt,{moveId});break;
    }
    case 'battle.catch':{
      noQuestion(s);const b=s.battle;if(!b||b.status!=='active'||b.kind!=='wild')throw new Error('只能捕捉野生宝可梦');
      s.question=makeQuestion(s,'catch',rt);break;
    }
    case 'battle.switch':{
      noQuestion(s);const b=s.battle,id=text(p,'partnerId');if(!b||b.status!=='active'||!s.team.includes(id)||(b.teamHp[id]??0)<=0)throw new Error('这位伙伴现在不能出战');
      const next=s.partners.find(p=>p.id===id)!;b.playerId=id;b.playerHp=b.teamHp[id];b.playerMaxHp=hp(next.speciesId,next.level);
      result=enemyTurn(s)??{message:species(next.speciesId).name+'上场了！',effect:'attack'};break;
    }
    case 'battle.leave':noQuestion(s);s.battle=null;result={message:'回到地图，伙伴们已经恢复体力。'};break;
    case 'team.update':{
      noBattle(s);noQuestion(s);const team=ids(p,'partnerIds',3);if(!team.length||team.some(id=>!s.partners.some(x=>x.id===id&&!x.sealed)))throw new Error('选择 1 到 3 位已唤醒的伙伴');
      s.team=team;result={message:'出战队伍准备好了！'};break;
    }
    case 'moves.update':{
      noBattle(s);noQuestion(s);const partner=s.partners.find(x=>x.id===text(p,'partnerId'));if(!partner)throw new Error('伙伴不存在');
      const moves=ids(p,'moveIds',4);if(!moves.length||moves.some(id=>!availableMoves(partner).some(m=>m.id===id)))throw new Error('选择 1 到 4 个已经学会的招式');
      partner.moves=moves;result={message:'招式准备好了！'};break;
    }
    case 'evolve':{
      noBattle(s);noQuestion(s);const partner=s.partners.find(x=>x.id===text(p,'partnerId')),to=number(p,'speciesId',1,10000);
      if(!partner||partner.sealed||!EVOLUTIONS.some(e=>e.from===partner.speciesId&&e.to===to&&e.level<=partner.level))throw new Error('还没到这次进化的时机');
      partner.speciesId=to;partner.moves=defaultMoves(to,partner.level);addCaught(s,to);result={message:'进化成功！'+species(to).name+'会继续陪你冒险。',effect:'evolve'};addEvent(s,rt,result.message);break;
    }
    case 'parent.settings':{
      const numeric:Record<string,[number,number]>={baseExp:[0,1000],dailyCap:[1,5000],captureLimit:[0,30],attackBonus:[1,2],comboBonus:[1,3],catchBonus:[0,0.5],fastMultiplier:[1,2],streakBonus:[0,500],englishPerQuestion:[0,0.1],sealDays:[1,30],maxWordLevel:[1,3]};
      for(const [key,[min,max]] of Object.entries(numeric)){if(key in p){const value=number(p,key,min,max);Object.assign(s.settings,{[key]:['attackBonus','comboBonus','catchBonus','fastMultiplier','englishPerQuestion'].includes(key)?value:Math.round(value)});}}
      if('weekdayPassDate'in p)s.settings.weekdayPassDate=p.weekdayPassDate===true?day:'';
      if('fastDeadline'in p){const time=text(p,'fastDeadline',5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('请输入有效时间');s.settings.fastDeadline=time;}
      result={message:'家庭规则已保存'};break;
    }
    case 'parent.tasks':{
      if(!Array.isArray(p.tasks)||p.tasks.length>20)throw new Error('最多设置 20 项任务');
      s.settings.tasks=p.tasks.map((item:unknown)=>{if(!item||typeof item!=='object')throw new Error('任务格式错误');const t=item as Record<string,unknown>;return {id:text(t,'id',60),name:text(t,'name',40),active:t.active===true};});
      if(new Set(s.settings.tasks.map(t=>t.id)).size!==s.settings.tasks.length)throw new Error('任务编号不能重复');
      result={message:'任务清单已保存'};break;
    }
    case 'parent.words':{
      if(!Array.isArray(p.words)||p.words.length>1000)throw new Error('每次最多导入 1000 个词');
      for(const raw of p.words){
        if(!raw||typeof raw!=='object')throw new Error('词表格式有误');const w=raw as Record<string,unknown>;
        const word=text(w,'word',60).trim(),bank=wordBank(s);
        const existing=bank.find(x=>x.id===w.id)??bank.find(x=>x.word.toLowerCase()===word.toLowerCase());
        if(bank.some(x=>x.word.toLowerCase()===word.toLowerCase()&&x.id!==existing?.id))throw new Error('词库中已有同名单词，请直接编辑原词');
        const item:Word={id:existing?.id??rt.uuid(),word,meaning:text(w,'meaning',100).trim(),topic:text(w,'topic',40),level:number(w,'level',1,3),example:text(w,'example',200)};
        s.customWords=s.customWords.filter(x=>x.id!==item.id);s.customWords.push(item);s.disabledWordIds=s.disabledWordIds.filter(id=>id!==item.id);
      }
      result={message:'词库已更新，共 '+wordsFor(s).length+' 个可用词'};break;
    }
    case 'parent.word.disable':{
      const id=text(p,'wordId');
      if(p.disabled===false){s.disabledWordIds=s.disabledWordIds.filter(x=>x!==id);result={message:'该单词已恢复出题'};}
      else {if(wordsFor(s).length<=4)throw new Error('至少保留四个单词');if(!s.disabledWordIds.includes(id))s.disabledWordIds.push(id);result={message:'该单词已暂停出题'};}
      break;
    }
    case 'parent.npc':{
      const npc=s.npcs.find(n=>n.id===text(p,'id'));if(!npc)throw new Error('NPC 不存在');
      const regionId=text(p,'regionId');region(regionId);
      const update:Partial<Npc>={name:text(p,'name',30),line:text(p,'line',200),quest:text(p,'quest',100),regionId,x:Math.round(number(p,'x',2,37)),y:Math.round(number(p,'y',2,23))};
      if(!isWalkable(update.x!,update.y!,region(regionId).biome)||s.npcs.some(n=>n.id!==npc.id&&n.regionId===regionId&&n.x===update.x&&n.y===update.y))throw new Error('请把朋友放在没有障碍、没有其他 NPC 的空地上');
      Object.assign(npc,update);result={message:'朋友的信息已保存'};break;
    }
    default:throw new Error('不支持的操作，请刷新页面');
  }
  return {state:s,result};
}
