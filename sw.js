/* প্রবাসী হিসাব — Service Worker
   অ্যাপের ফাইলগুলো ফোনে জমা রাখে, যাতে অ্যাপ ইন্টারনেট ছাড়াও চলে।
   ইন্টারনেট থাকলে অ্যাপ খোলার সময় সবসময় GitHub থেকে নতুন ভার্সন নেয়;
   নেট না থাকলে (বা ৪ সেকেন্ডে উত্তর না এলে) ফোনে রাখা কপি দেখায়। */
const CACHE = 'hisab-v3';
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './icon-180.png'];
const CDN_FILES = ['https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];
const CACHEABLE_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return; // Google Sheet-এর API সরাসরি নেটে যাবে

  if (sameOrigin && req.mode === 'navigate') e.respondWith(openApp());
  else e.respondWith(cacheThenUpdate(e, req, sameOrigin));
});

/** অ্যাপ খোলা: আগে নেট থেকে নতুন index.html, না পেলে ফোনের কপি */
async function openApp() {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(new Request('./index.html', { cache: 'no-cache', credentials: 'same-origin' })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    cache.put('./index.html', res.clone());
    return res;
  } catch (err) {
    return (await cache.match('./index.html')) || offlinePage();
  }
}

/** অন্য ফাইল (আইকন, ফন্ট, চার্ট): ফোনের কপি সাথে সাথে, পেছনে নতুন কপি নামিয়ে রাখা */
async function cacheThenUpdate(e, req, sameOrigin) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: sameOrigin });
  const net = sameOrigin ? fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })) : fetch(req);
  const fresh = net.then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { e.waitUntil(fresh); return cached; }
  return (await fresh) || offlinePage();
}

function offlinePage() {
  return new Response('অফলাইন', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
