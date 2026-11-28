/**
 * doc_viewer_sw.js — 한눈뷰어 서비스 워커
 * 1) 안드로이드 PWA share_target (카카오톡·내 파일 [공유] → 로컬 Cache Storage에 임시 보관 후 뷰어 즉시 열람, 서버 전송 0%)
 * 2) 앱 쉘 및 지연 로딩된 PDF.js 오프라인 캐싱 (비행기 모드에서도 즉시 열람)
 */
const APP_CACHE = 'doc-viewer-app-v1';
const SHARE_CACHE = 'doc-viewer-share';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('doc-viewer-app-') && k !== APP_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1) 안드로이드 공유 파일 로컬 수신 (서버 전송 절대 없음)
  if (event.request.method === 'POST' && /\/doc_viewer_share$/.test(url.pathname)) {
    event.respondWith((async () => {
      let n = 0;
      try {
        const form = await event.request.formData();
        const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.name);
        const cache = await caches.open(SHARE_CACHE);
        for (const k of await cache.keys()) await cache.delete(k);
        for (const f of files) {
          await cache.put(new URL('__shared__/' + n, self.registration.scope).href, new Response(f, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Name': encodeURIComponent(f.name),
              'X-Time': String(f.lastModified || Date.now())
            }
          }));
          n++;
        }
      } catch (_e) {}
      return Response.redirect(new URL('doc_viewer.html?shared=' + n, self.registration.scope).href, 303);
    })());
    return;
  }

  // 2) 앱 파일 & PDF.js 네트워크 우선 + 오프라인 캐시 폴백 (항상 최신 유지 + 오프라인 보장)
  if (event.request.method === 'GET' && url.origin === self.location.origin &&
      /\/(doc_viewer\.html|manifest\.webmanifest|pdf\.min\.js|pdf\.worker\.min\.js|doc-\d+\.png|doc-maskable-\d+\.png)$/.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const net = await fetch(event.request);
        if (net && net.ok) {
          const cache = await caches.open(APP_CACHE);
          cache.put(event.request, net.clone());
        }
        return net;
      } catch (_e) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw _e;
      }
    })());
  }
});
