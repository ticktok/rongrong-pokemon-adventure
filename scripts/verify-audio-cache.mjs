import {chromium} from '@playwright/test';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const file=JSON.parse(await readFile('content/pronunciations.json')).apple;
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),page=await context.newPage();
try{
 await page.goto(process.env.PREVIEW_URL??'http://127.0.0.1:4173/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const result=await page.evaluate(async file=>{
  const full=await fetch('/'+file);const size=(await full.arrayBuffer()).byteLength;
  const range=await fetch('/'+file,{headers:{Range:'bytes=2-8'}}),suffix=await fetch('/'+file,{headers:{Range:'bytes=-8'}}),bad=await fetch('/'+file,{headers:{Range:'bytes='+size+'-'}});
  return {size,range:{status:range.status,bytes:(await range.arrayBuffer()).byteLength,header:range.headers.get('content-range')},suffix:{status:suffix.status,bytes:(await suffix.arrayBuffer()).byteLength},bad:bad.status};
 },file);
 assert.equal(result.range.status,206);assert.equal(result.range.bytes,7);assert.equal(result.range.header,'bytes 2-8/'+result.size);assert.deepEqual(result.suffix,{status:206,bytes:8});assert.equal(result.bad,416);
 await page.waitForFunction(async file=>!!(await caches.match('/'+file)),file);await context.setOffline(true);
 const offline=await page.evaluate(async file=>{const r=await fetch('/'+file,{headers:{Range:'bytes=0-'}});return {status:r.status,size:(await r.arrayBuffer()).byteLength};},file);assert.equal(offline.status,206);assert.equal(offline.size,result.size);
 await page.evaluate(file=>{const a=new Audio('/'+file);window.__cacheAudio=a;const button=document.createElement('button');button.id='play-cached-audio';button.textContent='播放缓存';button.onclick=()=>{a.play().catch(e=>window.__audioError=e.message);};document.body.append(button);},file);
 await page.locator('#play-cached-audio').click();await page.waitForFunction(()=>window.__cacheAudio.currentTime>0);assert.equal(await page.evaluate(()=>window.__audioError),undefined);
 console.log('PASS: production Service Worker serves full, partial, suffix and invalid audio ranges; cached MP3 plays offline in Chrome.');
}finally{await browser.close();}
