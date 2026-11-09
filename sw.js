/* Service worker: tiene in memoria i file dell'app per aprirla anche senza rete.
   Prima prova la rete (così gli aggiornamenti arrivano subito), se manca usa la copia salvata.
   A ogni nuova versione dell'app aggiornare CACHE. I dati dei rotabili non passano di qui. */
const CACHE = 'controlli-rotabili-2.0.0';
const FILE_APP = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icona.svg', './icona-192.png', './icona-512.png'];

self.addEventListener('install', (evento) => {
    evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE_APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys()
            .then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (evento) => {
    const richiesta = evento.request;
    if (richiesta.method !== 'GET' || new URL(richiesta.url).origin !== self.location.origin) return;
    evento.respondWith(
        fetch(richiesta)
            .then((risposta) => {
                const copia = risposta.clone();
                if (risposta.ok) caches.open(CACHE).then((c) => c.put(richiesta, copia));
                return risposta;
            })
            .catch(() => caches.match(richiesta, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
    );
});
