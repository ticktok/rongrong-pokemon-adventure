// Prepare preview metadata only. Never downloads artwork or changes gameplay packs.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pinyin} from 'pinyin-pro';
import assert from 'node:assert/strict';

const base='https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const cache=new URL('../private/pokedex-source/',import.meta.url);
await mkdir(cache,{recursive:true});
function csv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c===','||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}
  else if(c!=='\r')cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}
 const headers=rows.shift();return rows.filter(r=>r.length===headers.length).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
}
async function source(name){
 const file=new URL(name,cache);
 if(!process.argv.includes('--refresh')){try{return csv(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}}
 const response=await fetch(base+name,{signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(name+': HTTP '+response.status);
 const text=await response.text();await writeFile(file,text);return csv(text);
}
const [species,names,pokemon,pokemonTypes,types]=await Promise.all(['pokemon_species.csv','pokemon_species_names.csv','pokemon.csv','pokemon_types.csv','types.csv'].map(source));
const first=JSON.parse(await readFile(new URL('../content/gen1/species.json',import.meta.url),'utf8'));
const localized=new Map(names.filter(n=>['9','12'].includes(n.local_language_id)).map(n=>[n.pokemon_species_id+':'+n.local_language_id,n.name]));
const defaultForms=new Map(pokemon.filter(p=>p.is_default==='1').map(p=>[p.species_id,p]));
const typeNames=new Map(types.map(t=>[t.id,t.identifier]));
const pronunciation={
 '长尾怪手':'chang wei guai shou','长毛猪':'chang mao zhu','长鼻叶':'chang bi ye','长翅鸥':'chang chi ou',
 '长耳兔':'chang er tu','长毛狗':'chang mao gou','长尾火狐':'chang wei huo hu','长毛巨魔':'chang mao ju mo',
 '乐天河童':'le tian he tong','重泥挽马':'zhong ni wan ma','大葱鸭':'da cong ya','葱游兵':'cong you bing','猫鼬探长':'mao you tan zhang',
};
const entries=species.filter(s=>Number(s.id)<=1025).map(s=>{
 const id=Number(s.id),original=first.find(p=>p.id===id),form=defaultForms.get(s.id);
 assert(form,'Missing default form for '+id);
 const name=original?.name??localized.get(s.id+':12'),english=localized.get(s.id+':9');
 assert(name&&english,'Missing name for '+id);
 const syllables=pronunciation[name]?.split(' ')??pinyin(name,{toneType:'none',type:'array',v:true});
 const aliases=[english,s.identifier,form.identifier,original?.english,syllables.join(''),syllables.map(s=>s[0]).join('')].filter(Boolean);
 return {id,name,english,generation:'gen'+s.generation_id,types:original?.types??pokemonTypes.filter(t=>t.pokemon_id===form.id).sort((a,b)=>Number(a.slot)-Number(b.slot)).map(t=>typeNames.get(t.type_id)),aliases:[...new Set(aliases)]};
}).sort((a,b)=>a.id-b.id);
assert.equal(entries.length,1025);assert(entries.every((e,i)=>e.id===i+1&&e.types.length>=1&&e.types.length<=2&&e.types.every(Boolean)));
await mkdir(new URL('../content/pokedex/',import.meta.url),{recursive:true});
await writeFile(new URL('../content/pokedex/species.json',import.meta.url),'[\n'+entries.map(e=>'  '+JSON.stringify(e)).join(',\n')+'\n]\n');
console.log('Prepared',entries.length,'preview entries; gameplay data and artwork unchanged.');
