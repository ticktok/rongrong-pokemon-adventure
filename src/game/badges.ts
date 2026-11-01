import {PACKS,type GenerationPack} from '../../content/packs';
export function badgeCollections(packs:GenerationPack[]=PACKS){
  return packs.filter(p=>p.regions.length).map(p=>({id:p.id,label:p.collectionLabel,badges:p.regions.map(r=>({regionId:r.id,name:r.badge,region:r.name,leader:r.leader,image:'assets/badges/'+p.id+'/'+p.badgeImages[r.id]+'.png'}))}));
}
export const BADGE_COLLECTIONS=badgeCollections();
export function collectionId(hash:string,collections=BADGE_COLLECTIONS){const id=new URLSearchParams(hash.split('?')[1]??'').get('generation');return collections.find(p=>p.id===id)?.id??collections[0]?.id;}
