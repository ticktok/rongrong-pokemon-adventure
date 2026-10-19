// Check actual Chrome media playback, stop, failed load and recovery without cloud data.
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const files=JSON.parse(await readFile('content/pronunciations.json')),word=Object.keys(files).find(w=>w==='apple')??Object.keys(files)[0];assert(word);
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
try{
 await page.goto(process.env.TEST_BASE_URL??'http://127.0.0.1:5173/');
 await page.evaluate(async word=>{
  const mod=await import('/src/pronunciation.ts');window.__audioTest=mod;
  const button=document.createElement('button');button.textContent='测试发音';button.id='audio-test';button.onclick=()=>mod.playPronunciation(word);document.body.append(button);
  window.speechSynthesis.speak=()=>{throw new Error('Device speech synthesis must not run');};
 },word);
 await page.locator('#audio-test').click();await page.waitForFunction(()=>window.__audioTest.pronunciationSnapshot().status==='playing');
 await page.evaluate(()=>window.__audioTest.stopPronunciation());assert.equal(await page.evaluate(()=>window.__audioTest.pronunciationSnapshot().status),'idle');
 await page.route('**/'+files[word],r=>r.fulfill({status:503,body:'temporarily unavailable'}));await page.locator('#audio-test').click();await page.waitForFunction(()=>window.__audioTest.pronunciationSnapshot().status==='error');
 await page.unroute('**/'+files[word]);await page.locator('#audio-test').click();await page.waitForFunction(()=>window.__audioTest.pronunciationSnapshot().status==='playing');
 await page.waitForFunction(()=>window.__audioTest.pronunciationSnapshot().status==='idle');
 await page.evaluate(()=>window.__audioTest.playPronunciation('not-in-the-word-bank'));assert.match(await page.evaluate(()=>window.__audioTest.pronunciationSnapshot().message),/准备中/);
 console.log('PASS: real Chrome click starts and ends MP3 playback, stop works, 503 is visible and retry succeeds; no system TTS.');
}finally{await browser.close();}
