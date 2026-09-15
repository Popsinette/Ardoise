/* ============================================================================
   Ardoise — service worker

   Ardoise ne parle à aucun serveur : tout ce qu'elle affiche vient du
   stockage privé du navigateur. Le rôle de ce fichier se réduit donc à une
   seule chose — garder la coque (HTML, CSS, JS, police, icônes) en cache
   pour que l'app s'ouvre instantanément et fonctionne sans réseau, y compris
   au tout premier lancement hors connexion.

   Les données, elles, ne passent jamais par ici : elles ne transitent pas
   par le réseau du tout.

   Portée : ce fichier est servi depuis le même sous-dossier qu'index.html
   (…/Ardoise/sw.js), donc sa portée est ce sous-dossier. Tous les chemins
   ci-dessous sont relatifs pour la même raison.
   ========================================================================= */

const VERSION = 'ardoise-v2';
const CACHE_COQUE = `${VERSION}-coque`;

const COQUE = [
  './',
  'index.html',
  'app.js',
  'data.js',
  'styles.css',
  'manifest.json',
  '404.html',
  'fonts/bricolage-grotesque-latin.woff2',
  'icons/ardoise.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
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

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET') return;
  // Rien de ce que fait Ardoise ne sort de son propre dossier ; si une
  // requête ailleurs apparaît, ce n'est pas à nous de la servir.
  if (new URL(requete.url).origin !== self.location.origin) return;

  e.respondWith(requete.mode === 'navigate'
    ? navigation(requete)
    : cachePuisRafraichir(requete));
});

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
  return (await reseau) || new Response('', { status: 504, statusText: 'Hors connexion' });
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
             'Ardoise n’est pas encore installée hors ligne. Ouvrez-la une fois avec du réseau.',
             { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
