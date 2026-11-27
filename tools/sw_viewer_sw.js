/**
 * sw_viewer_sw.js — STAR Works CAD 뷰어 서비스 워커
 * 하는 일은 하나: 휴대폰에서 다른 앱(카카오톡·내 파일 등)이 "공유"로 보낸 파일을 받아
 * 뷰어가 열 수 있게 잠시 보관한 뒤 뷰어 화면으로 넘깁니다. (파일은 기기 밖으로 나가지 않음)
 * 그 밖의 요청은 건드리지 않습니다(화면을 따로 저장해 두지 않으므로 항상 최신 화면).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !/\/sw_viewer_share$/.test(url.pathname)) return;
  event.respondWith((async () => {
    let n = 0;
    try {
      const form = await event.request.formData();
      const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.name);
      const cache = await caches.open('sw-viewer-share');
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
    } catch (_e) { /* 보관 실패 → 뷰어가 "받은 파일 없음"을 알림 */ }
    return Response.redirect(new URL('sw_viewer.html?shared=' + n, self.registration.scope).href, 303);
  })());
});
