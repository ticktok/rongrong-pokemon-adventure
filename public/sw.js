const CACHE='rongrong-assets-v__APP_VERSION__';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(!url.pathname.includes('/assets/')&&!url.pathname.endsWith('/icon.svg'))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(event.request);if(cached)return cached;
    const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;
  }));
});
