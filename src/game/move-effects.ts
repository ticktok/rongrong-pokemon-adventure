export type MoveShape='dash'|'stars'|'beam'|'flame'|'wheel'|'jet'|'wave'|'vine'|'leaves'|'lightning'|'snow'|'wind'|'slash'|'cross'|'needles'|'sludge'|'bomb'|'mud'|'quake'|'wings'|'pulse'|'rings'|'fangs'|'sonic'|'rock'|'cage'|'avalanche'|'haunt'|'fist'|'orb'|'breath'|'claw'|'headbutt'|'kiss'|'moon';
export interface MoveVisual {shape:MoveShape;color:number;accent:number;tier:number;physical:boolean}
const shapes:Record<string,readonly [MoveShape,MoveShape,MoveShape]>={
 normal:['dash','stars','beam'],fire:['flame','wheel','jet'],water:['jet','wave','jet'],grass:['vine','leaves','beam'],electric:['lightning','orb','lightning'],
 ice:['snow','wind','beam'],fighting:['slash','fist','cross'],poison:['needles','sludge','bomb'],ground:['mud','jet','quake'],flying:['wind','wings','slash'],
 psychic:['rings','beam','pulse'],bug:['fangs','beam','sonic'],rock:['rock','cage','avalanche'],ghost:['haunt','fist','orb'],dragon:['breath','wave','claw'],
 dark:['fangs','pulse','fangs'],steel:['claw','headbutt','beam'],fairy:['wind','kiss','moon'],
};
const palette:Record<string,readonly [number,number]>={normal:[0xe9c778,0xffffff],fire:[0xf47732,0xffe683],water:[0x249dd1,0xc3f8ff],grass:[0x61a845,0xe1f8a4],electric:[0xffd22e,0xfffbcd],ice:[0x63d9df,0xf4ffff],fighting:[0xd3704d,0xffe5b4],poison:[0x9ea448,0xe2f294],ground:[0xa77b45,0xe2c087],flying:[0x91c8ca,0xf2ffed],psychic:[0xee8197,0xffd7b6],bug:[0x8fa93e,0xf0f4ae],rock:[0x978260,0xe4d4b3],ghost:[0x64778c,0xc5e3e1],dragon:[0x368d9b,0xbcebd5],dark:[0x4b515c,0xb5b9ae],steel:[0x789b9b,0xe8fcfa],fairy:[0xeb9d9c,0xffeed3]};
export const MOVE_VISUALS:Record<string,MoveVisual>=Object.fromEntries(Object.entries(shapes).flatMap(([type,variants])=>variants.map((shape,tier)=>[type+'-'+tier,{shape,tier,color:palette[type][0],accent:palette[type][1],physical:['dash','slash','cross','claw','fangs','fist','headbutt','wings'].includes(shape)}])));
