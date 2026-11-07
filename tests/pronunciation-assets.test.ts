import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import recordings from '../content/pronunciations.json';
import words from '../content/words.json';
// Media is maintained separately from mutable family content; validate the shipped bundle.
describe('pronunciation assets',()=>{
 it('ships playable-source metadata for every built-in word, identifying synthetic audio separately',()=>{
  const sources=JSON.parse(readFileSync('public/assets/word-audio/sources.json','utf8'));
  const missing=JSON.parse(readFileSync('content/pronunciation-missing.json','utf8'));
  expect(missing).toEqual({});
  expect(Object.keys(recordings)).toHaveLength(words.length);
  for(const item of words){
   const word=item.word.toLowerCase(),file=(recordings as Record<string,string>)[word];
   expect(file,item.word).toBeTruthy();
   expect(file).toMatch(/^assets\/word-audio\/word-[\d-]+\.mp3$/);expect(existsSync('public/'+file)).toBe(true);
   expect(sources[word].path).toBe(file);expect(sources[word].author).toBeTruthy();expect(sources[word].license).toBeTruthy();
   if(sources[word].kind==='synthetic'){
    expect(sources[word].voice).toBe('en-US-JennyNeural');expect(sources[word].accent).toBe('US');
    expect(sources[word].source).toBe('https://www.microsoft.com/edge/features/read-aloud');
    expect(sources[word].license).not.toMatch(/^CC/);
   }else expect(sources[word].source).toMatch(/^https:\/\/commons.wikimedia.org\//);
  }
 });
});
