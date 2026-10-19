import {randomUUID,randomInt} from 'node:crypto';
import {PgStore} from './pg';
import {gameCommand,gameCaller} from './game-service';
import type {ApiResponse} from '../src/game/types';
const db=new PgStore(process.env.SCF_NAMESPACE||'wind-d7gesdlb779f8214f',()=>process.env.CLOUDBASE_APIKEY??'');
export async function main(event:unknown,context:unknown):Promise<ApiResponse>{
  return gameCommand(event,gameCaller(context),db,{now:new Date(),uuid:randomUUID,random:()=>randomInt(0,1_000_000)/1_000_000});
}
