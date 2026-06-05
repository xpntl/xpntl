// Minimal service worker — its only job is to make xpntl installable as a PWA.
//
// Deliberately network-only (no precache): the app's assets are content-hashed
// and served with `cache-control: no-cache`, so we never want the SW shadowing a
// fresh deploy with a stale cached build. The mere presence of a fetch handler
// is what satisfies the installability criteria; we let every request hit the
// network unchanged.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // No respondWith() → full network passthrough. Intentional.
});
