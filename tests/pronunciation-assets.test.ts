import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import recordings from '../content/pronunciations.json';
import words from '../content/words.json';
// Media is maintained separately from mutable family content; validate the shipped bundle.
describe('pronunciation assets',()=>{
 it('accounts for every built-in word with a licensed recording or an explicit missing entry',()=>{
  const sources=JSON.parse(readFileSync('public/assets/word-audio/sources.json','utf8'));
  const missing=JSON.parse(readFileSync('content/pronunciation-missing.json','utf8'));
  for(const item of words){
   const word=item.word.toLowerCase(),file=(recordings as Record<string,string>)[word];
   if(!file){expect(missing[item.word]).toBeTruthy();continue;}
   expect(file).toMatch(/^assets\/word-audio\/word-[\d-]+\.mp3$/);expect(existsSync('public/'+file)).toBe(true);
   expect(sources[word].path).toBe(file);expect(sources[word].author).toBeTruthy();expect(sources[word].license).toBeTruthy();expect(sources[word].source).toMatch(/^https:\/\/commons.wikimedia.org\//);
  }
 });
});
