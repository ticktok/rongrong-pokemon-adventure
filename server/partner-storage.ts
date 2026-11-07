import type {GameState,PartnerBox} from '../src/game/types';
export const TEAM_SIZE=6,BOX_SIZE=30;
export function createBox(s:GameState,name?:string):PartnerBox {
  s.boxes??=[];
  let n=s.boxes.length+1;while(s.boxes.some(b=>b.id==='box-'+n))n++;
  const box={id:'box-'+n,name:name??'伙伴盒子 '+n,slots:Array<string|null>(BOX_SIZE).fill(null)};
  s.boxes.push(box);return box;
}
export function storePartner(s:GameState,id:string){
  const box=s.boxes!.find(b=>b.slots.includes(null))??createBox(s);
  box.slots[box.slots.indexOf(null)]=id;
}
export function initializeBoxes(s:GameState){
  s.boxes??=[];if(!s.boxes.length)createBox(s);
  const stored=new Set(s.boxes.flatMap(b=>b.slots.filter((id):id is string=>id!==null)));
  for(const p of s.partners)if(!s.team.includes(p.id)&&!stored.has(p.id)){storePartner(s,p.id);stored.add(p.id);}
}
export function updateTeam(s:GameState,team:string[]){
  if(!team.length||team.length>TEAM_SIZE||new Set(team).size!==team.length||team.some(id=>!s.partners.some(p=>p.id===id&&!p.sealed)))throw new Error('选择 1 到 6 位已唤醒的伙伴');
  initializeBoxes(s);
  const removed=s.team.filter(id=>!team.includes(id));
  // Incoming partners leave their own vacancies for outgoing partners, in team order.
  for(const id of team.filter(id=>!s.team.includes(id))){
    const box=s.boxes!.find(b=>b.slots.includes(id));
    if(!box)throw new Error('伙伴位置已更新，请刷新后重试');
    box.slots[box.slots.indexOf(id)]=removed.shift()??null;
  }
  s.team=team;
  for(const id of removed)storePartner(s,id);
}
export function movePartners(s:GameState,ids:string[],boxId:string){
  initializeBoxes(s);const box=s.boxes!.find(b=>b.id===boxId);
  if(!box||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>s.team.includes(id)||!s.partners.some(p=>p.id===id)))throw new Error('请选择盒子里的伙伴');
  const moving=ids.filter(id=>!box.slots.includes(id));
  if(box.slots.filter(id=>id===null).length<moving.length)throw new Error('这个盒子空位不足，请新建或选择其他盒子');
  for(const id of moving){for(const from of s.boxes!)from.slots=from.slots.map(value=>value===id?null:value);box.slots[box.slots.indexOf(null)]=id;}
}
