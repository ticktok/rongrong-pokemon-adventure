import {TYPE_NAMES} from '../../content/world';

// PokéAPI type IDs also identify the Scarlet/Violet symbol sprites.
const TYPE_ICON_IDS:Record<string,number>={
  normal:1,fighting:2,flying:3,poison:4,ground:5,rock:6,bug:7,ghost:8,steel:9,
  fire:10,water:11,grass:12,electric:13,psychic:14,ice:15,dragon:16,dark:17,fairy:18,
};
type IconSize=24|28|32;

export function TypeIcon({type,size=24}:{type:string;size?:IconSize}){
  const name=TYPE_NAMES[type]+'属性';
  return <img className="type-icon" src={import.meta.env.BASE_URL+'assets/pokemon/types/'+TYPE_ICON_IDS[type]+'.png'} width={size} height={size} alt={name} title={name}/>;
}

export function TypeIcons({types,size=24,className=''}:{types:readonly string[];size?:IconSize;className?:string}){
  return <span className={'type-icons'+(className?' '+className:'')}>{types.map(type=><TypeIcon key={type} type={type} size={size}/>)}</span>;
}
