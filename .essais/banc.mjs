/* ============================================================================
   Banc d'essai — ouvre l'app dans Chromium avec une couche Supabase simulée.

   Pourquoi une simulation : le module @supabase/supabase-js est chargé depuis
   un CDN, et le réseau sortant de cet environnement de développement le
   bloque. On remplace donc la requête vers le CDN par un module qui rend un
   faux client, alimenté par .essais/jeu-dessai.mjs. L'app, elle, n'est pas
   modifiée d'une ligne.
   ========================================================================= */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import * as J from './jeu-dessai.mjs';
import { brancher } from './faux-supabase.mjs';
import { demarrerServeur } from './serveur.mjs';

const PORT = Number(process.env.PORT || 8123);
const serveur = await demarrerServeur(PORT);
const BASE = `http://127.0.0.1:${PORT}/Ardoise/`;
const SORTIE = new URL('./captures/', import.meta.url).pathname;
mkdirSync(SORTIE, { recursive: true });


const ECRANS = [
  ['semaine', null],
  ['tout', async (page) => { await page.getByRole('button', { name: 'Tout', exact: true }).click(); }],
  ['chantiers', async (page) => { await page.getByRole('button', { name: 'Chantiers' }).click(); }],
  ['artisans', async (page) => { await page.getByRole('button', { name: 'Artisans' }).click(); }],
  ['fiche', async (page) => {
    await page.getByRole('button', { name: 'Chantiers' }).click();
    await page.waitForTimeout(200);
    await page.locator('.ligne__corps', { hasText: 'Isolation des combles' }).first().click();
  }],
  ['ajout', async (page) => { await page.getByRole('button', { name: /Écrire sur l/ }).click(); }],
  ['reglages', async (page) => { await page.getByRole('button', { name: 'Réglages' }).click(); }],
  ['fiche-artisan', async (page) => {
    await page.getByRole('button', { name: 'Artisans' }).click();
    await page.waitForTimeout(200);
    await page.locator('.artisan__ouvrir', { hasText: 'Couverture Rouvier' }).click();
  }],
  ['filtres', async (page) => {
    await page.getByRole('button', { name: 'Tout', exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Filtrer/ }).click();
  }],
];

const APPAREILS = [
  ['iphone-se-375', 375, 667],
  ['iphone-pro-max-430', 430, 932],
];

const erreurs = [];
const navigateur = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

for (const [nomAppareil, largeur, hauteur] of APPAREILS) {
  for (const theme of ['light', 'dark']) {
    if (nomAppareil !== 'iphone-se-375' && theme === 'dark') continue;
    const contexte = await navigateur.newContext({
      viewport: { width: largeur, height: hauteur },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: theme,
      serviceWorkers: 'block',
    });
    for (const [nomEcran, action] of ECRANS) {
      if (nomAppareil !== 'iphone-se-375' && !['semaine', 'chantiers'].includes(nomEcran)) continue;
      const page = await contexte.newPage();
      page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`[${nomEcran}] ${m.text()}`); });
      page.on('pageerror', (e) => erreurs.push(`[${nomEcran}] ${e.message}`));
      await brancher(page);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('.onglets', { timeout: 8000 });
      if (action) { await action(page); await page.waitForTimeout(450); }
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${SORTIE}${nomAppareil}-${theme}-${nomEcran}.png` });
      await page.close();
    }
    await contexte.close();
  }
}

/* ------------------------------- vérifications automatiques ------------- */
const contexte = await navigateur.newContext({
  viewport: { width: 375, height: 667 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris',
  serviceWorkers: 'block',
});
const page = await contexte.newPage();
page.on('pageerror', (e) => erreurs.push('[vérif] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') erreurs.push('[vérif] ' + m.text()); });
await brancher(page);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.onglets');

const resultats = [];
const verifier = (nom, ok, detail = '') =>
  resultats.push(`${ok ? '  OK  ' : 'ÉCHEC '} ${nom}${detail ? ' — ' + detail : ''}`);

// 1. Les cibles tactiles font au moins 44 px.
const petites = await page.evaluate(() => {
  const trop = [];
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 44 || r.width < 44) {
      trop.push(`${el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)} « ${(el.textContent || '').trim().slice(0, 28)} »`);
    }
  }
  return trop;
});
verifier('cibles tactiles ≥ 44 px', petites.length === 0, petites.join(' | '));

// 2. Pas de débordement horizontal.
for (const l of [375, 390, 414, 430]) {
  await page.setViewportSize({ width: l, height: 800 });
  await page.waitForTimeout(120);
  const deborde = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  verifier(`pas de débordement à ${l} px`, !deborde);
}
await page.setViewportSize({ width: 375, height: 667 });

// 3. Le minium n'apparaît QUE sur du retard.
const minium = await page.evaluate(() => {
  const attendu = getComputedStyle(document.documentElement).getPropertyValue('--minium').trim();
  const hex = attendu.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
  const cible = `rgb(${hex.join(', ')})`;
  const fautifs = [];
  for (const el of document.querySelectorAll('.ecran *, .volet *')) {
    const s = getComputedStyle(el);
    const utilise = [s.color, s.backgroundColor, s.borderLeftColor, s.borderBottomColor].includes(cible);
    if (!utilise) continue;
    // Deux usages admis, et deux seulement : le retard, et le bouton qui
    // confirme une suppression définitive.
    if (!el.closest('.section--retard, .ligne--retard, .onglet, .bouton--rouge')) {
      fautifs.push(el.className + ' « ' + (el.textContent || '').trim().slice(0, 24) + ' »');
    }
  }
  return fautifs;
});
verifier('le minium ne sert qu’au retard', minium.length === 0, minium.join(' | '));

// Même contrôle, mais dans les panneaux : c'est là que la règle avait cédé.
await page.getByRole('button', { name: 'Réglages' }).click();
await page.waitForTimeout(400);
const miniumVolet = await page.evaluate(() => {
  const attendu = getComputedStyle(document.documentElement).getPropertyValue('--minium').trim();
  const hex = attendu.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
  const cible = `rgb(${hex.join(', ')})`;
  const fautifs = [];
  for (const el of document.querySelectorAll('.volet *')) {
    const st = getComputedStyle(el);
    if (![st.color, st.backgroundColor, st.borderLeftColor].includes(cible)) continue;
    if (!el.closest('.bouton--rouge, .message')) {
      fautifs.push(el.className + ' \u00ab ' + (el.textContent || '').trim().slice(0, 24) + ' \u00bb');
    }
  }
  return fautifs;
});
verifier('le minium ne d\u00e9borde pas dans les panneaux', miniumVolet.length === 0, miniumVolet.join(' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 4. Cocher une tâche récurrente reporte l'échéance au lieu de l'archiver.
const avant = await page.evaluate(() => document.querySelectorAll('.ligne').length);
await page.locator('.ligne', { hasText: 'Ramoner le poêle' }).getByRole('button', { name: /Marquer/ }).click();
await page.waitForTimeout(1200);
const apres = await page.evaluate(() => document.querySelectorAll('.ligne').length);
const appels = await page.evaluate(() => globalThis.__ardoiseEssai.appels);
verifier('tâche récurrente cochée → RPC complete_task',
  appels.some((a) => a[0] === 'rpc' && a[1] === 'complete_task'));
// Elle quitte « Cette semaine » puisqu'elle n'est plus due, mais elle doit
// être toujours là, à faire, avec une échéance repoussée d'un an.
await page.getByRole('button', { name: 'Tout', exact: true }).click();
await page.waitForTimeout(350);
const survivante = await page.evaluate(() => {
  const li = [...document.querySelectorAll('.ligne')]
    .find((x) => x.querySelector('.ligne__titre').textContent.includes('Ramoner'));
  if (!li) return null;
  return {
    faite: li.classList.contains('ligne--faite'),
    retard: li.classList.contains('ligne--retard'),
    coche: li.querySelector('.coche').getAttribute('aria-pressed'),
    meta: li.querySelector('.ligne__meta').textContent,
  };
});
verifier('récurrente : toujours à faire, plus en retard, échéance repoussée',
  !!survivante && !survivante.faite && !survivante.retard && survivante.coche === 'false',
  survivante ? survivante.meta : 'ligne disparue');
await page.getByRole('button', { name: 'Semaine' }).click();
await page.waitForTimeout(300);

// 5. L'ajout rapide crée bien une tâche.
await page.getByRole('button', { name: /Écrire sur l/ }).click();
await page.waitForTimeout(300);
await page.getByLabel('Titre de la tâche').fill('Revisser la poignée de la porte');
await page.getByRole('button', { name: 'Cuisine', exact: true }).click();
await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
await page.waitForTimeout(500);
const inseres = await page.evaluate(() =>
  globalThis.__ardoiseEssai.appels.filter((a) => a[0] === 'insert' && a[1] === 'tasks'));
verifier('ajout rapide → insert dans tasks', inseres.length === 1,
  inseres[0] ? inseres[0][2].titre : 'aucun');
verifier('ajout rapide → la pièce est bien portée',
  !!(inseres[0] && inseres[0][2].room_id), inseres[0] ? String(inseres[0][2].room_id) : '');

await contexte.close();

// 6. Le service worker s'enregistre bien sur le sous-chemin, et seulement
//    sur lui : c'est le piège classique de GitHub Pages.
const ctxSw = await navigateur.newContext({ viewport: { width: 375, height: 667 }, locale: 'fr-FR' });
const pageSw = await ctxSw.newPage();
await pageSw.goto(BASE, { waitUntil: 'load' });
await pageSw.waitForTimeout(1500);
const sw = await pageSw.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return r ? r.scope : null;
});
verifier('service worker enregistré sur le sous-chemin',
  !!sw && sw.endsWith('/Ardoise/'), String(sw));
const coque = await pageSw.evaluate(async () => {
  const noms = await caches.keys();
  const c = await caches.open(noms.find((n) => n.includes('coque')));
  return (await c.keys()).map((r) => new URL(r.url).pathname);
});
verifier('coque préchargée (index, css, js, police)',
  ['/Ardoise/styles.css', '/Ardoise/app.js', '/Ardoise/data.js',
   '/Ardoise/fonts/bricolage-grotesque-latin.woff2'].every((f) => coque.includes(f)),
  coque.length + ' fichiers');

// 7. La promesse hors ligne : après un premier passage en ligne, l'app doit
//    s'ouvrir et montrer la dernière liste connue sans réseau du tout.
const ctxHL = await navigateur.newContext({ viewport: { width: 375, height: 667 },
  locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await brancher(ctxHL);                       // sur le contexte : le SW aussi passe par là
const pageHL = await ctxHL.newPage();
await pageHL.goto(BASE, { waitUntil: 'networkidle' });
await pageHL.waitForSelector('.ligne');
await pageHL.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
await pageHL.waitForTimeout(800);
await ctxHL.unroute('**/config.js');
await ctxHL.unroute('**cdn.jsdelivr.net/**');
await ctxHL.setOffline(true);
await pageHL.reload({ waitUntil: 'domcontentloaded' });
let horsLigne = null;
try {
  await pageHL.waitForSelector('.ligne', { timeout: 8000 });
  horsLigne = await pageHL.evaluate(() => ({
    lignes: document.querySelectorAll('.ligne').length,
    bandeau: (document.getElementById('bandeau') || {}).textContent || '',
  }));
} catch (e) { /* on le dira plus bas */ }
verifier('hors ligne : l\u2019app s\u2019ouvre sur la dernière liste connue',
  !!horsLigne && horsLigne.lignes > 0,
  horsLigne ? `${horsLigne.lignes} lignes, bandeau « ${horsLigne.bandeau.trim()} »` : 'rien affiché');
verifier('hors ligne : le bandeau le dit',
  !!horsLigne && /hors connexion/i.test(horsLigne.bandeau),
  horsLigne ? horsLigne.bandeau.trim() : '');
await pageHL.screenshot({ path: `${SORTIE}iphone-se-375-light-horsligne.png` });
await ctxHL.close();
await ctxSw.close();
await navigateur.close();
serveur.close();

console.log('\n=== Vérifications ===');
for (const r of resultats) console.log(r);
console.log('\n=== Erreurs console / page ===');
console.log(erreurs.length ? erreurs.join('\n') : '  aucune');
process.exit(resultats.some((r) => r.startsWith('ÉCHEC')) || erreurs.length ? 1 : 0);
