import {chromium} from '@playwright/test';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const recordings=JSON.parse(await readFile('content/pronunciations.json'));
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
try{
 await page.goto(process.env.TEST_BASE_URL??'http://127.0.0.1:5173/');
 const result=await page.evaluate(async recordings=>{
  const audio=new AudioContext(),results=[];
  for(const [word,path] of Object.entries(recordings)){
   const response=await fetch('/'+path);if(!response.ok)throw new Error(word+': HTTP '+response.status);
   const buffer=await audio.decodeAudioData(await response.arrayBuffer());let peak=0,energy=0;
   for(const value of buffer.getChannelData(0)){peak=Math.max(peak,Math.abs(value));energy+=value*value;}
   results.push({word,duration:buffer.duration,peak,rms:Math.sqrt(energy/buffer.length)});
  }
  await audio.close();return results;
 },recordings);
 const suspect=result.filter(r=>r.duration<0.15||r.duration>5||r.peak>=.99||r.rms<.005);
 await writeFile('artifacts/pronunciation-validation.json',JSON.stringify({decoded:result.length,suspect,recordings:result},null,2));
 assert.deepEqual(suspect,[]);console.log('PASS: '+result.length+' MP3 files decoded in Chrome; non-silent, bounded duration and unclipped peaks.');
}catch(error){console.error(error);process.exitCode=1;}finally{await browser.close();}
