import type {GameState, GameCommand} from '../src/game/types';
import {validateSave} from './save-validation';

const contentCommands=new Set(['parent.settings','parent.tasks','parent.words','parent.word.disable','parent.npc']);
export function requireOwnContent(command:GameCommand,following:boolean){
  if(following&&contentCommands.has(command.type))throw new Error('测试账号的内容与规则自动跟随融融，此处只能查看');
}

// Only configuration crosses the family boundary. Progress and unfinished questions stay local.
export function followContent(own:GameState,source:GameState):GameState {
  const next=structuredClone(own);
  next.npcs=structuredClone(source.npcs);
  next.settings=structuredClone(source.settings);
  next.customWords=structuredClone(source.customWords);
  next.disabledWordIds=structuredClone(source.disabledWordIds);
  try{return validateSave(next);}
  catch{throw new Error('跟随的内容与当前测试存档存在不兼容引用，进度已保留，请联系家长检查');}
}
