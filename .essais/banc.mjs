/* ============================================================================
   Banc d'essai — ouvre Ardoise dans Chromium et la vérifie.

   L'app n'a plus de serveur ni de compte : le banc la charge, lui fait
   avaler un jeu d'essai par sa propre fonction de restauration, puis
   contrôle ce qui compte — les cibles tactiles, le rendu de 375 à 430 px,
   la portée de la couleur de signal, la règle de récurrence, l'ajout
   rapide, la sauvegarde et le démarrage hors ligne.
   ========================================================================= */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { sauvegarde } from './jeu-dessai.mjs';
import { demarrerServeur } from './serveur.mjs';

const PORT = Number(process.env.PORT || 8123);
const serveur = await demarrerServeur(PORT);
const BASE = `http://127.0.0.1:${PORT}/Ardoise/`;
const SORTIE = new URL('./captures/', import.meta.url).pathname;
mkdirSync(SORTIE, { recursive: true });

const JEU = JSON.stringify(sauvegarde());

/** Charge l'app puis lui fait restaurer le jeu d'essai, par le même chemin
    que le bouton « Restaurer une sauvegarde ». */
async function ouvrir(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.onglets', { timeout: 10000 });
  await page.evaluate(async (json) => {
    const D = await import('./data.js');
    await D.importer(json);
  }, JEU);
  await page.waitForSelector('.ligne', { timeout: 10000 });
  await page.waitForTimeout(200);
}

const ECRANS = [
  ['semaine', null],
  ['tout', async (p) => { await p.getByRole('button', { name: 'Tout', exact: true }).click(); }],
  ['chantiers', async (p) => { await p.getByRole('button', { name: 'Chantiers' }).click(); }],
  ['artisans', async (p) => { await p.getByRole('button', { name: 'Artisans' }).click(); }],
  ['fiche', async (p) => {
    await p.getByRole('button', { name: 'Chantiers' }).click();
    await p.waitForTimeout(200);
    await p.locator('.ligne__corps', { hasText: 'Isolation des combles' }).first().click();
  }],
  ['ajout', async (p) => { await p.getByRole('button', { name: /Écrire sur l/ }).click(); }],
  ['reglages', async (p) => { await p.getByRole('button', { name: 'Réglages' }).click(); }],
  ['fiche-artisan', async (p) => {
    await p.getByRole('button', { name: 'Artisans' }).click();
    await p.waitForTimeout(200);
    await p.locator('.artisan__ouvrir', { hasText: 'Couverture Rouvier' }).click();
  }],
  ['filtres', async (p) => {
    await p.getByRole('button', { name: 'Tout', exact: true }).click();
    await p.waitForTimeout(200);
    await p.getByRole('button', { name: /Filtrer/ }).click();
  }],
];

const APPAREILS = [['iphone-se-375', 375, 667], ['iphone-pro-max-430', 430, 932]];

const erreurs = [];
const navigateur = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

/* ------------------------------------------------------------- captures -- */

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
      await ouvrir(page);
      if (action) { await action(page); await page.waitForTimeout(450); }
      await page.screenshot({ path: `${SORTIE}${nomAppareil}-${theme}-${nomEcran}.png` });
      await page.close();
    }
    await contexte.close();
  }
}

/* -------------------------------------------------------- vérifications -- */

const resultats = [];
const verifier = (nom, ok, detail = '') =>
  resultats.push(`${ok ? '  OK  ' : 'ÉCHEC '} ${nom}${detail ? ' — ' + detail : ''}`);

const contexte = await navigateur.newContext({
  viewport: { width: 375, height: 667 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris',
  serviceWorkers: 'block',
});
const page = await contexte.newPage();
page.on('pageerror', (e) => erreurs.push('[vérif] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') erreurs.push('[vérif] ' + m.text()); });
await ouvrir(page);

// 1. Toute zone qu'on touche du doigt fait au moins 44 px.
const petites = await page.evaluate(() => {
  const trop = [];
  for (const el of document.querySelectorAll('button, a[href], input:not(.invisible), select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 44 || r.width < 44) {
      trop.push(`${el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  return trop;
});
verifier('cibles tactiles ≥ 44 px', petites.length === 0, petites.join(' | '));

// 2. Aucun débordement horizontal sur la plage d'iPhone visée.
for (const l of [375, 390, 414, 430]) {
  await page.setViewportSize({ width: l, height: 800 });
  await page.waitForTimeout(120);
  const deborde = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  verifier(`pas de débordement à ${l} px`, !deborde);
}
await page.setViewportSize({ width: 375, height: 667 });

// 3. La couleur de signal ne sert qu'au retard — écrans et panneaux.
const chercherMinium = () => page.evaluate(() => {
  const attendu = getComputedStyle(document.documentElement).getPropertyValue('--minium').trim();
  const hex = attendu.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
  const cible = `rgb(${hex.join(', ')})`;
  const fautifs = [];
  for (const el of document.querySelectorAll('.ecran *, .volet *')) {
    const s = getComputedStyle(el);
    if (![s.color, s.backgroundColor, s.borderLeftColor, s.borderBottomColor].includes(cible)) continue;
    // Deux usages admis, et deux seulement : le retard, et le bouton qui
    // confirme une suppression définitive.
    if (!el.closest('.section--retard, .ligne--retard, .onglet, .bouton--rouge, .message')) {
      fautifs.push(el.className + ' « ' + (el.textContent || '').trim().slice(0, 24) + ' »');
    }
  }
  return fautifs;
});
verifier('le minium ne sert qu’au retard', (await chercherMinium()).length === 0);
await page.getByRole('button', { name: 'Réglages' }).click();
await page.waitForTimeout(400);
const miniumVolet = await chercherMinium();
verifier('le minium ne déborde pas dans les panneaux', miniumVolet.length === 0, miniumVolet.join(' | '));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 4. Cocher une récurrente : elle n'est pas archivée, son échéance avance,
//    et le passage est gardé dans l'historique.
await page.locator('.ligne', { hasText: 'Ramoner le poêle' })
  .getByRole('button', { name: /Marquer/ }).click();
await page.waitForTimeout(1100);
const apres = await page.evaluate(async () => {
  const D = await import('./data.js');
  const t = D.etat.taches.find((x) => x.titre.includes('Ramoner'));
  return { statut: t.statut, echeance: t.echeance, completed_at: t.completed_at,
           passages: D.etat.passages.filter((p) => p.task_id === t.id).length };
});
const futur = apres.echeance > new Date().toISOString().slice(0, 10);
verifier('récurrente cochée : toujours à faire, échéance repoussée',
  apres.statut === 'a_faire' && apres.completed_at === null && futur,
  `statut ${apres.statut}, échéance ${apres.echeance}`);
verifier('récurrente cochée : le passage est gardé', apres.passages === 1,
  `${apres.passages} passage(s)`);

// 5. L'ajout rapide : trois secondes, un titre, une pièce.
await page.getByRole('button', { name: /Écrire sur l/ }).click();
await page.waitForTimeout(300);
await page.getByLabel('Titre de la tâche').fill('Revisser la poignée de la porte');
await page.getByRole('button', { name: 'Cuisine', exact: true }).click();
await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
await page.waitForTimeout(500);
const ajoutee = await page.evaluate(async () => {
  const D = await import('./data.js');
  const t = D.etat.taches.find((x) => x.titre.includes('Revisser'));
  return t ? { piece: !!t.room_id } : null;
});
verifier('ajout rapide : la tâche est enregistrée avec sa pièce',
  !!ajoutee && ajoutee.piece);

// 6. Les données survivent au rechargement — c'est tout l'intérêt du local.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ligne', { timeout: 10000 });
const survivante = await page.evaluate(async () => {
  const D = await import('./data.js');
  return D.etat.taches.some((x) => x.titre.includes('Revisser'));
});
verifier('les données survivent au rechargement', survivante);

// 7. Aller-retour export / import : une sauvegarde doit se relire.
const allerRetour = await page.evaluate(async () => {
  const D = await import('./data.js');
  const avant = D.etat.taches.length;
  const copie = JSON.stringify(D.instantane());
  await D.toutEffacer();
  const vide = D.etat.taches.length;
  await D.importer(copie);
  return { avant, vide, apres: D.etat.taches.length };
});
verifier('export puis import : rien ne se perd',
  allerRetour.vide === 0 && allerRetour.apres === allerRetour.avant,
  `${allerRetour.avant} → ${allerRetour.vide} → ${allerRetour.apres}`);

// 8. Un fichier étranger doit être refusé avec un message qui dit quoi faire.
const refus = await page.evaluate(async () => {
  const D = await import('./data.js');
  try { await D.importer('{"app":"AutreChose"}'); return null; }
  catch (e) { return e.message; }
});
verifier('un fichier étranger est refusé clairement',
  !!refus && /ardoise/i.test(refus), refus || 'aucune erreur levée');

await contexte.close();

// 9. Le service worker, sa portée, et l'ouverture sans réseau du tout.
const ctxSw = await navigateur.newContext({ viewport: { width: 375, height: 667 }, locale: 'fr-FR' });
const pageSw = await ctxSw.newPage();
await ouvrir(pageSw);
await pageSw.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
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

await ctxSw.setOffline(true);
await pageSw.reload({ waitUntil: 'domcontentloaded' });
let horsLigne = null;
try {
  await pageSw.waitForSelector('.ligne', { timeout: 10000 });
  horsLigne = await pageSw.evaluate(() => document.querySelectorAll('.ligne').length);
} catch (e) { /* dit plus bas */ }
verifier('hors ligne : l’app s’ouvre et la liste est là',
  horsLigne > 0, horsLigne ? `${horsLigne} lignes` : 'rien affiché');
await pageSw.screenshot({ path: `${SORTIE}iphone-se-375-light-horsligne.png` });
await ctxSw.close();

await navigateur.close();
serveur.close();

console.log('\n=== Vérifications ===');
for (const r of resultats) console.log(r);
console.log('\n=== Erreurs console / page ===');
console.log(erreurs.length ? erreurs.join('\n') : '  aucune');
process.exit(resultats.some((r) => r.startsWith('ÉCHEC')) || erreurs.length ? 1 : 0);
