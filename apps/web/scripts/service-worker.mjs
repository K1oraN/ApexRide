import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function writeServiceWorker() {
  const files = ['/index.html', '/favicon.svg', '/manifest.webmanifest'];
  for (const directory of ['assets']) {
    for (const name of await readdir(`dist/${directory}`))
      files.push(`/${directory}/${name}`);
  }
  const version = createHash('sha256')
    .update(JSON.stringify(files))
    .update(await readFile('dist/index.html'))
    .digest('hex')
    .slice(0, 16);
  await writeFile(
    'dist/sw.js',
    `/* Generated app shell only. No API, auth, photos, tiles or external URLs. */
const CACHE = 'apex-shell-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
// No skipWaiting: a new build waits until the tabs using the old build close.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('apex-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const navigation = request.mode === 'navigate' && !url.pathname.includes('.');
  if (!navigation && !FILES.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(navigation ? '/index.html' : url.pathname);
    return saved || fetch(request);
  }));
});
`,
  );
}
