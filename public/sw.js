const CACHE='rongrong-assets-v__APP_VERSION__';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(!url.pathname.includes('/assets/')&&!url.pathname.endsWith('/icon.svg'))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const isAudio=url.pathname.includes('/assets/word-audio/')&&url.pathname.endsWith('.mp3');
    // Cache API rejects 206 responses. Store the complete short recording, then
    // serve the requested byte range from that copy (including while offline).
    const headers=new Headers(event.request.headers);
    if(isAudio)headers.delete('range');
    const fullRequest=isAudio?new Request(event.request,{headers}):event.request;
    let response=await cache.match(fullRequest);
    if(!response){
      response=await fetch(fullRequest);
      if(response.status===200)event.waitUntil(cache.put(fullRequest,response.clone()).catch(error=>console.warn('素材缓存暂不可用',error.message)));
    }
    const range=event.request.headers.get('range');
    if(!isAudio||!range||response.status!==200)return response;
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||(!match[1]&&!match[2]))return response;
    const bytes=await response.arrayBuffer(),size=bytes.byteLength;
    const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
    return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':response.headers.get('content-type')||'audio/mpeg','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1)}});
  }));
});
