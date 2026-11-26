const CACHE_NAME = 'formula-for-victory-v15'; // Bump this on every change so tablets pick up the new version
const CACHE_PREFIX = 'formula-for-victory-'; // Only this app's own caches are ever deleted: every app on richardbrb9-coder.github.io shares the same cache storage

// Everything is stored inside the app (no CDNs), and all addresses are relative so it works in a GitHub Pages subfolder.
const CORE_FILES = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './teams.js',
    './myteams.js',
    './sound.js',
    './season.js',
    './championship.js',
    './cards.js',
    './cardart.js',
    './teamdesign.js',
    './manifest.json',
    './race.js',
    './track.js',
    './trackdetail.js',
    './scenery.js',
    './backdrop.js',
    './standdata.js',
    './carmodel.js',
    './formula.js',
    './offroad.js',
    './curves.js',
    './cockpit.js',
    './weather.js',
    './post.js',
    './suspension.js',
    './reflections.js',
    './soundfx.js',
    './effects.js',
    './damage.js',
    './circuits/index.js',
    './circuits/monza.js',
    './circuits/monza.geo.js',
    './circuits/monza-scenery.js',
    './circuits/common.js',
    './circuits/silverstone.js',
    './circuits/silverstone.geo.js',
    './circuits/silverstone-scenery.js',
    './circuits/monaco.js',
    './circuits/monaco.geo.js',
    './circuits/monaco-scenery.js',
    './circuits/suzuka.js',
    './circuits/suzuka.geo.js',
    './circuits/suzuka-scenery.js',
    './circuits/lasvegas.js',
    './circuits/lasvegas.geo.js',
    './circuits/lasvegas-scenery.js',
    './lib/three.module.min.js',
    './lib/three.core.min.js',
    './lib/three-LICENSE.txt',
    './icon-192.png',
    './icon-512.png',
    './fonts/orbitron-latin-700-normal.woff2',
    './fonts/orbitron-latin-900-normal.woff2',
    './fonts/russo-one-latin-400-normal.woff2',
    './fonts/exo-2-latin-400-normal.woff2',
    './fonts/exo-2-latin-600-normal.woff2',
    './fonts/exo-2-latin-700-normal.woff2',
    './fonts/exo-2-latin-800-normal.woff2'
];
// Pictures and sounds: saved one by one, so a single missing file doesn't stop the install
const EXTRA_FILES = [
    './textures/asphalt_02_col.webp',
    './textures/asphalt_02_nor.webp',
    './textures/coast_sand_01_col.webp',
    './textures/coast_sand_01_nor.webp',
    './textures/leafy_grass_col.webp',
    './textures/leafy_grass_nor.webp',
    './skies/riviera.webp',
    './skies/riviera_low.webp',
    './skies/airfield.webp',
    './skies/airfield_low.webp',
    './skies/park.webp',
    './skies/park_low.webp',
    './skies/overcast.webp',
    './skies/overcast_low.webp',
    './skies/day.webp',
    './skies/sunset.webp',
    './skies/night.webp',
    './trees/round.webp',
    './trees/slim.webp',
    './trees/bush_a.webp',
    './stands/crowd_1.webp',
    './stands/crowd_2.webp',
    './stands/crowd_3.webp',
    './sounds/v8_loop.wav',
    './sounds/v12_loop.wav',
    './sounds/high_loop.wav',
    './sounds/roar.wav',
    './fonts/Exo2-OFL.txt',
    './fonts/Orbitron-OFL.txt',
    './fonts/RussoOne-OFL.txt'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // cache: 'reload' skips the browser's own short-term cache, so a new version never saves an older file
            const fresh = (url) => new Request(url, { cache: 'reload' });
            await cache.addAll(CORE_FILES.map(fresh)); // the app can't work without these, so install fails if they fail
            let todo = [...EXTRA_FILES];
            for (let attempt = 0; attempt < 3 && todo.length; attempt++) {
                const results = await Promise.allSettled(todo.map((url) => cache.add(fresh(url))));
                todo = todo.filter((url, i) => results[i].status === 'rejected');
            }
        })
    );
});

// Delete this app's own old caches (and only those) so the tablet actually updates
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME && n.startsWith(CACHE_PREFIX)).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

// The page, the manifest, the teams' names and the circuit data are checked online first (when there is a connection), so changes reach
// the tablet straight away. Everything else (code, pictures, sounds, fonts) comes from the saved copy first, for speed.
const NETWORK_FIRST = ['index.html', 'manifest.json', 'teams.js', 'circuits/index.js', 'circuits/monza.js', 'circuits/monza.geo.js',
    'circuits/silverstone.js', 'circuits/silverstone.geo.js', 'circuits/monaco.js', 'circuits/monaco.geo.js',
    'circuits/suzuka.js', 'circuits/suzuka.geo.js', 'circuits/lasvegas.js', 'circuits/lasvegas.geo.js'];
const NETWORK_TIMEOUT_MS = 4000;
const ownCache = () => caches.open(CACHE_NAME);   // (never another app's cache)

function saveCopy(request, response) {
    if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        ownCache().then((cache) => cache.put(request, copy));
    }
    return response;
}
function fromCache(request) {
    return ownCache().then((cache) => cache.match(request, { ignoreSearch: true })
        .then((cached) => cached || (request.mode === 'navigate' ? cache.match('./index.html') : undefined)));
}
function networkFirst(request) {
    const fromNetwork = fetch(request, { cache: 'no-cache' }).then((response) => saveCopy(request, response));
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    // Use the online copy if it arrives in time; otherwise (slow or no connection) use the saved copy
    return Promise.race([fromNetwork.catch(() => undefined), timeout])
        .then((response) => response || fromCache(request))
        .then((response) => response || fromNetwork)
        .catch(() => Response.error());
}
function cacheFirst(request) {
    return fromCache(request).then((cached) => cached || fetch(request).then((response) => saveCopy(request, response)).catch(() => Response.error()));
}

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith('http') || event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    const checkOnline = url.origin === self.location.origin &&
        (event.request.mode === 'navigate' || NETWORK_FIRST.some((name) => url.pathname.endsWith('/' + name)));
    event.respondWith(checkOnline ? networkFirst(event.request) : cacheFirst(event.request));
});
