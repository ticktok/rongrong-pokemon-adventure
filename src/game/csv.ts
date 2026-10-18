import type {Word} from './types';
export function parseWordCsv(input:string):{words:Omit<Word,'id'>[];errors:string[]}{
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  const source=input.replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  if(quoted)return {words:[],errors:['引号没有闭合，请检查 CSV 文件']};
  const header=rows.shift()?.map(x=>x.trim())??[],required=['word','meaning','topic','level','example'];
  if(!required.every(h=>header.includes(h)))return {words:[],errors:['表头需要包含 word,meaning,topic,level,example']};
  const words:Omit<Word,'id'>[]=[],errors:string[]=[],seen=new Set<string>();
  rows.forEach((values,i)=>{
    const get=(key:string)=>values[header.indexOf(key)]?.trim()??'';
    const item={word:get('word'),meaning:get('meaning'),topic:get('topic'),level:Number(get('level')),example:get('example')};
    if(!item.word||!item.meaning||!item.topic||!item.example||![1,2,3].includes(item.level)){errors.push('第 '+(i+2)+' 行：内容不完整或难度不是 1、2、3');return;}
    if(seen.has(item.word.toLowerCase())){errors.push('第 '+(i+2)+' 行：单词重复 '+item.word);return;}
    if(item.word.length>60||item.meaning.length>100||item.topic.length>40||item.example.length>200){errors.push('第 '+(i+2)+' 行：文字过长');return;}
    seen.add(item.word.toLowerCase());words.push(item);
  });
  if(words.length>1000)errors.push('每次最多导入 1000 个词');
  if(!words.length&&!errors.length)errors.push('词表中没有单词');
  return {words,errors};
}
