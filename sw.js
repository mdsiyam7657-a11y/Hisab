/* প্রবাসী হিসাব — Service Worker
   অ্যাপের ফাইলগুলো ফোনে জমা রাখে, যাতে অ্যাপ সাথে সাথে খোলে আর ইন্টারনেট ছাড়াও চলে।
   ফাইল আপডেট হলে পেছনে নতুন কপি নামিয়ে রাখে — পরেরবার খুললে নতুন ভার্সন দেখাবে। */
const CACHE = 'hisab-v2';
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './icon-180.png'];
const CDN_FILES = ['https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_FILES.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(CDN_FILES.map(u => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const CACHEABLE_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return; // Google Sheet-এর API সরাসরি নেটে যাবে

  // অ্যাপ খোলার সময় (navigation) সবসময় index.html দেখাই — #c=… লিংক থাকলেও
  const key = sameOrigin && req.mode === 'navigate' ? './index.html' : req;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: sameOrigin });
    // নিজের ফাইলগুলো সবসময় সার্ভারে নতুন ভার্সন আছে কিনা মিলিয়ে নেয়
    const net = sameOrigin ? fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })) : fetch(req);
    const fresh = net.then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(fresh); return cached; }
    const res = await fresh;
    return res || new Response('অফলাইন', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
