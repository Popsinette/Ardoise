/* ============================================================================
   Ardoise — service worker

   Deux régimes, comme demandé :
     · la coque (HTML, CSS, JS, polices, icônes) est servie depuis le cache,
       et rafraîchie en arrière-plan — l'app s'ouvre instantanément, même
       sans réseau, et prend la nouvelle version à l'ouverture suivante ;
     · les données passent par le réseau et ne sont JAMAIS mises en cache
       ici. Elles sont authentifiées et personnelles ; leur cache hors ligne
       vit dans IndexedDB, côté app, où la file d'attente sait quoi en faire.

   Portée : ce fichier est servi depuis le même sous-dossier que index.html
   (…/Ardoise/sw.js), donc sa portée est ce sous-dossier. Tous les chemins
   ci-dessous sont relatifs pour la même raison.
   ========================================================================= */

const VERSION = 'ardoise-v1';
const CACHE_COQUE = `${VERSION}-coque`;
const CACHE_TIERS = `${VERSION}-tiers`;

/* La coque, préchargée à l'installation : après le premier lancement, plus
   rien de tout ça n'a besoin du réseau. */
const COQUE = [
  './',
  'index.html',
  'app.js',
  'data.js',
  'config.js',
  'styles.css',
  'manifest.json',
  'fonts/bricolage-grotesque-latin.woff2',
  'icons/ardoise.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon-180.png',
];

/* Le module Supabase vit sur un CDN, mais il fait partie de la coque : sans
   lui l'app ne peut pas parler au serveur. On le précharge dès l'installation
   plutôt que d'attendre qu'un premier passage l'ait mis en cache au vol —
   sinon le tout premier lancement hors connexion tombe à côté. */
const MODULE_SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    caches.open(CACHE_TIERS).then((c) =>
      c.add(new Request(MODULE_SUPABASE, { mode: 'cors' }))
        .catch((err) => console.warn('[sw] module Supabase non préchargé', err)));
    const cache = await caches.open(CACHE_COQUE);
    // cache: 'reload' : on veut les fichiers du serveur, pas ceux que le
    // navigateur garde dans son propre cache HTTP.
    await Promise.all(COQUE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' }))
        .catch((err) => console.warn('[sw] non mis en cache :', url, err))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms
      .filter((n) => n.startsWith('ardoise-') && !n.startsWith(VERSION))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'passer-a-la-suite') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);

  // Données Supabase : on ne touche à rien. Les réponses sont authentifiées
  // et personnelles ; les mettre en cache ici serait au mieux inutile, au
  // pire une fuite entre deux comptes sur le même appareil.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // Le module Supabase servi par le CDN fait partie de la coque, même s'il
  // vient d'ailleurs : sans lui l'app ne démarre pas hors ligne.
  if (url.origin !== self.location.origin) {
    e.respondWith(cacheDAbord(requete, CACHE_TIERS));
    return;
  }

  // Navigation : on sert la coque, et l'app se débrouille avec ses données.
  if (requete.mode === 'navigate') {
    e.respondWith(navigation(requete));
    return;
  }

  e.respondWith(cachePuisRafraichir(requete));
});

/** Cache d'abord, réseau seulement si absent. Pour ce qui ne change pas. */
async function cacheDAbord(requete, nomCache) {
  const cache = await caches.open(nomCache);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  try {
    const reponse = await fetch(requete);
    if (reponse && (reponse.ok || reponse.type === 'opaque')) {
      cache.put(requete, reponse.clone());
    }
    return reponse;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Hors connexion' });
  }
}

/** Cache d'abord pour la vitesse, réseau en arrière-plan pour la fraîcheur :
    l'écran s'affiche tout de suite, la version suivante arrive au prochain
    lancement. C'est ce qui évite d'avoir à versionner le cache à la main
    chaque fois qu'on corrige une ligne de CSS. */
async function cachePuisRafraichir(requete) {
  const cache = await caches.open(CACHE_COQUE);
  const enCache = await cache.match(requete);

  const reseau = fetch(requete).then((reponse) => {
    if (reponse && reponse.ok) cache.put(requete, reponse.clone());
    return reponse;
  }).catch(() => null);

  if (enCache) return enCache;
  const reponse = await reseau;
  return reponse || new Response('', { status: 504, statusText: 'Hors connexion' });
}

/** Une navigation hors ligne doit ouvrir l'app, pas la page d'erreur du
    navigateur. On tente le réseau, et on retombe sur la coque en cache. */
async function navigation(requete) {
  const cache = await caches.open(CACHE_COQUE);
  try {
    const reponse = await fetch(requete);
    if (reponse && reponse.ok) cache.put('index.html', reponse.clone());
    return reponse;
  } catch (e) {
    return (await cache.match('index.html')) ||
           (await cache.match('./')) ||
           new Response('<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;padding:24px">' +
             'Ardoise n’est pas encore installée hors ligne. Reconnectez-vous une fois au réseau.',
             { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
