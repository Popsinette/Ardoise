/* ============================================================================
   Ardoise — couche de données

   Tout ce qui touche au réseau et au stockage vit ici : le client Supabase,
   l'authentification par code, les requêtes, le temps réel, le cache local et
   la file d'attente hors connexion. app.js ne parle jamais à Supabase
   directement — il lit `etat` et appelle les fonctions de ce fichier.

   Le principe hors ligne : on écrit d'abord dans l'état local (l'écran
   répond tout de suite), puis on envoie. Si l'envoi échoue pour cause de
   réseau, l'opération part dans une file IndexedDB et sera rejouée au retour
   de la connexion. Si elle échoue pour une autre raison (droits, données
   invalides), on la jette et on le dit : la garder reviendrait à la rejouer
   indéfiniment.
   ========================================================================= */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CDN_SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* La configuration est-elle remplie ? On préfère un écran qui explique quoi
   faire à un écran blanc avec une erreur dans la console.                    */
export const CONFIG_REMPLIE =
  typeof SUPABASE_URL === 'string' &&
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL.trim()) &&
  typeof SUPABASE_ANON_KEY === 'string' &&
  SUPABASE_ANON_KEY.trim().length > 20 &&
  !SUPABASE_ANON_KEY.includes('collez-ici');

/* ------------------------------------------------------------------ état -- */

export const etat = {
  phase: 'demarrage',   // demarrage | config | connexion | sansfoyer | prete
  session: null,
  membre: null,         // { user_id, prenom, household_id }
  foyer: null,          // { id, nom }
  membres: [],          // les personnes du foyer, pour l'assignation
  pieces: [],
  taches: [],
  artisans: [],
  enLigne: navigator.onLine,
  enAttente: 0,         // écritures en file
  rejetees: [],         // écritures refusées par le serveur, à signaler
  depuisCache: false,   // les listes affichées viennent-elles du cache ?
  erreurTechnique: null,
  degrade: false,       // la bibliothèque n'a pas pu se charger : lecture seule
                        // sur le cache, les écritures partent en file d'attente
};

const abonnes = new Set();

/** S'abonner aux changements d'état. Renvoie la fonction de désabonnement. */
export function surChangement(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

function emettre(detail = {}) {
  for (const fn of abonnes) {
    try { fn(detail); } catch (e) { console.error('[ardoise] abonné en erreur', e); }
  }
}

/* --------------------------------------------------------------- client -- */

let sb = null;

async function clientSupabase() {
  if (sb) return sb;
  if (!CONFIG_REMPLIE) throw new Error('config');
  let createClient;
  try {
    ({ createClient } = await import(CDN_SUPABASE));
  } catch (e) {
    const panne = new Error(
      "La bibliothèque Supabase n'a pas pu être chargée. " +
      'Vérifiez votre connexion, puis rouvrez Ardoise.'
    );
    panne.reseau = true;   // même traitement qu'une coupure : on met en file
    throw panne;
  }
  sb = createClient(SUPABASE_URL.trim(), SUPABASE_ANON_KEY.trim(), {
    auth: {
      // La session survit à la fermeture de la PWA : on se connecte une fois
      // par appareil, le jeton de rafraîchissement fait le reste.
      persistSession: true,
      autoRefreshToken: true,
      // Pas de détection d'URL : on n'utilise pas de lien magique, justement
      // parce qu'il ouvrirait Safari au lieu de la PWA.
      detectSessionInUrl: false,
      storageKey: 'ardoise-auth',
    },
    realtime: { params: { eventsPerSecond: 4 } },
  });
  return sb;
}

/* --------------------------------------------------------- stockage local --
   IndexedDB plutôt que localStorage : la file d'attente doit survivre à un
   onglet tué par iOS en pleine écriture, et localStorage est synchrone.     */

const DB_NOM = 'ardoise';
const DB_VERSION = 1;
let dbPromise = null;

function ouvrirDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOM, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('file')) {
        db.createObjectStore('file', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    console.warn('[ardoise] IndexedDB indisponible', e);
    return null;
  });
  return dbPromise;
}

function tx(db, magasin, mode, action) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(magasin, mode);
    const req = action(t.objectStore(magasin));
    t.onerror = () => reject(t.error);
    t.oncomplete = () => resolve(req && req.result);
  });
}

async function cacheLire(clef) {
  const db = await ouvrirDb();
  if (!db) return null;
  try { return await tx(db, 'cache', 'readonly', (s) => s.get(clef)); }
  catch { return null; }
}

async function cacheEcrire(clef, valeur) {
  const db = await ouvrirDb();
  if (!db) return;
  try { await tx(db, 'cache', 'readwrite', (s) => s.put(valeur, clef)); }
  catch (e) { console.warn('[ardoise] cache non écrit', e); }
}

async function fileAjouter(op) {
  const db = await ouvrirDb();
  if (!db) return;
  await tx(db, 'file', 'readwrite', (s) => s.add({ ...op, ts: Date.now() }));
}

async function fileTout() {
  const db = await ouvrirDb();
  if (!db) return [];
  try { return (await tx(db, 'file', 'readonly', (s) => s.getAll())) || []; }
  catch { return []; }
}

async function fileRetirer(id) {
  const db = await ouvrirDb();
  if (!db) return;
  await tx(db, 'file', 'readwrite', (s) => s.delete(id));
}

async function majAttente() {
  etat.enAttente = (await fileTout()).length;
}

async function sauverCache() {
  if (!etat.foyer) return;
  await cacheEcrire('listes', {
    foyer: etat.foyer,
    membres: etat.membres,
    pieces: etat.pieces,
    taches: etat.taches,
    artisans: etat.artisans,
    le: Date.now(),
  });
}

/* ---------------------------------------------------------------- erreurs --
   Un message d'erreur qui ne dit pas quoi faire ne sert à rien. On traduit
   les cas réellement rencontrés, et on garde un repli lisible pour le reste. */

export function messageErreur(e) {
  if (!e) return 'Une erreur est survenue.';
  const brut = String(e.message || e.error_description || e).toLowerCase();
  const code = e.code || e.status;

  if (estReseau(e)) {
    return "Pas de connexion. Ce que vous écrivez est gardé et sera envoyé au retour du réseau.";
  }
  if (brut.includes('token has expired') || brut.includes('invalid') && brut.includes('otp')) {
    return "Ce code n'est plus valable. Demandez-en un nouveau, il reste actif une heure.";
  }
  if (brut.includes('invalid login credentials') || brut.includes('token') && brut.includes('expired')) {
    return "Code incorrect ou expiré. Vérifiez les six chiffres, ou demandez un nouveau code.";
  }
  if (brut.includes('rate limit') || code === 429) {
    return 'Trop de codes demandés coup sur coup. Patientez une minute avant de réessayer.';
  }
  if (brut.includes('signups not allowed') || brut.includes('not authorized')) {
    return "Les inscriptions sont fermées sur ce projet Supabase. Activez-les dans Authentication ▸ Sign In / Providers.";
  }
  if (code === '42501' || brut.includes('row-level security') || brut.includes('violates row-level')) {
    return "Votre compte n'est pas rattaché au foyer. Ajoutez sa ligne dans household_members (la marche à suivre est dans le README).";
  }
  if (code === '23505') return 'Cette entrée existe déjà.';
  if (code === 'PGRST301' || code === 401) {
    return 'Votre session a expiré. Reconnectez-vous avec un nouveau code.';
  }
  return e.message || 'Une erreur est survenue.';
}

function estReseau(e) {
  if (!e) return false;
  if (e.reseau === true) return true;
  if (!navigator.onLine) return true;
  const m = String(e.message || e).toLowerCase();
  return m.includes('failed to fetch') || m.includes('networkerror') ||
         m.includes('load failed') || m.includes('network request failed') ||
         e.name === 'TypeError' && m.includes('fetch');
}

/** Témoin de session : la bibliothèque range son jeton sous cette clef.
    On ne s'en sert que pour savoir s'il y a déjà eu une connexion sur cet
    appareil, afin d'oser afficher le cache sans avoir pu charger le client. */
function sessionEnregistree() {
  try {
    const brut = localStorage.getItem('ardoise-auth');
    if (!brut) return false;
    const s = JSON.parse(brut);
    return !!(s && (s.access_token || s.currentSession || s.refresh_token));
  } catch { return false; }
}

/* ------------------------------------------------------------ démarrage -- */

export async function demarrer() {
  // Le cache d'abord : la dernière liste connue s'affiche même hors ligne,
  // avant même de savoir si le réseau répond.
  const cache = await cacheLire('listes');
  if (cache) {
    etat.foyer = cache.foyer;
    etat.membres = cache.membres || [];
    etat.pieces = cache.pieces || [];
    etat.taches = cache.taches || [];
    etat.artisans = cache.artisans || [];
    etat.depuisCache = true;
  }
  await majAttente();

  if (!CONFIG_REMPLIE) { etat.phase = 'config'; emettre(); return; }

  // Si on a déjà une liste en cache et qu'une session a été enregistrée sur
  // cet appareil, on affiche immédiatement — avant même de savoir si le
  // réseau répond et si la bibliothèque se charge. C'est toute la promesse
  // du hors-ligne : sortir le téléphone dans la cave et voir la liste.
  const dejaConnecte = sessionEnregistree();
  if (cache && cache.foyer && dejaConnecte) { etat.phase = 'prete'; emettre(); }

  let client;
  try { client = await clientSupabase(); }
  catch (e) {
    etat.erreurTechnique = messageErreur(e);
    if (etat.phase === 'prete') { etat.degrade = true; emettre({ raison: 'horsligne' }); return; }
    etat.phase = 'config';
    emettre();
    return;
  }
  etat.degrade = false;

  const { data } = await client.auth.getSession();
  etat.session = data.session;

  client.auth.onAuthStateChange((evenement, session) => {
    etat.session = session;
    if (session?.access_token) client.realtime.setAuth(session.access_token);
    if (evenement === 'SIGNED_OUT') {
      etat.phase = 'connexion';
      etat.membre = null; etat.foyer = null;
      etat.pieces = []; etat.taches = []; etat.artisans = []; etat.membres = [];
      fermerCanal();
      emettre();
    }
  });

  if (!etat.session) { etat.phase = 'connexion'; emettre(); return; }
  await apresConnexion();
}

async function apresConnexion() {
  const client = await clientSupabase();
  if (etat.session?.access_token) client.realtime.setAuth(etat.session.access_token);

  try {
    const { data, error } = await client
      .from('household_members')
      .select('user_id, prenom, household_id, households ( id, nom )')
      .eq('user_id', etat.session.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      // Compte créé, mais pas encore rattaché au foyer. C'est l'étape
      // d'invitation du second téléphone : on l'explique au lieu de
      // laisser une liste vide inexplicable.
      etat.phase = 'sansfoyer';
      emettre();
      return;
    }

    etat.membre = { user_id: data.user_id, prenom: data.prenom, household_id: data.household_id };
    etat.foyer = data.households || { id: data.household_id, nom: 'Maison' };
    etat.phase = 'prete';
    emettre();
  } catch (e) {
    if (estReseau(e) && etat.foyer) {
      // Hors ligne au démarrage : on reste sur le cache, c'est tout l'intérêt.
      etat.phase = 'prete';
      etat.depuisCache = true;
      emettre();
      return;
    }
    etat.phase = etat.session ? 'sansfoyer' : 'connexion';
    etat.erreurTechnique = messageErreur(e);
    emettre();
    return;
  }

  // À partir d'ici l'app est utilisable : un échec de chargement ne doit plus
  // renvoyer sur un écran d'installation, seulement afficher le cache et le
  // dire.
  try {
    await toutCharger();
  } catch (e) {
    etat.erreurTechnique = messageErreur(e);
    etat.depuisCache = true;
    emettre({ raison: 'horsligne' });
  }
  abonnerTempsReel();
  rejouer();
}

/* ------------------------------------------------------- authentification --
   Code à six chiffres par email, jamais de lien magique : sur iPhone un lien
   ouvre Safari et non la PWA, et la session se retrouve du mauvais côté.    */

export async function envoyerCode(email) {
  const client = await clientSupabase();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifierCode(email, code) {
  const client = await clientSupabase();
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
  etat.session = data.session;
  await apresConnexion();
}

export async function deconnecter() {
  const client = await clientSupabase();
  fermerCanal();
  await client.auth.signOut();
  const db = await ouvrirDb();
  if (db) {
    try { await tx(db, 'cache', 'readwrite', (s) => s.clear()); } catch {}
    try { await tx(db, 'file', 'readwrite', (s) => s.clear()); } catch {}
  }
  etat.enAttente = 0;
}

/* ------------------------------------------------------------- lectures -- */

const CHAMPS_TACHE =
  'id, titre, notes, room_id, nature, statut, priorite, echeance, recurrence_mois, ' +
  'cout_estime, cout_reel, assigne_a, artisan_id, created_by, created_at, completed_at';

export async function toutCharger() {
  const client = await clientSupabase();
  const foyer = etat.foyer?.id;
  if (!foyer) return;

  try {
    const [pieces, taches, artisans, membres] = await Promise.all([
      client.from('rooms').select('id, nom, position').eq('household_id', foyer)
        .order('position').order('nom'),
      client.from('tasks').select(CHAMPS_TACHE).eq('household_id', foyer)
        .order('echeance', { ascending: true, nullsFirst: false }),
      client.from('artisans')
        .select('id, nom, metier, telephone, email, notes, deja_utilise, appreciation')
        .eq('household_id', foyer).order('nom'),
      client.from('household_members').select('user_id, prenom').eq('household_id', foyer),
    ]);

    for (const r of [pieces, taches, artisans, membres]) if (r.error) throw r.error;

    etat.pieces = pieces.data || [];
    etat.taches = taches.data || [];
    etat.artisans = artisans.data || [];
    etat.membres = membres.data || [];
    etat.depuisCache = false;
    await sauverCache();
    emettre({ raison: 'chargement' });
  } catch (e) {
    if (estReseau(e)) {
      etat.depuisCache = true;
      emettre({ raison: 'horsligne' });
      return;
    }
    throw e;
  }
}

/** L'historique des passages d'une tâche récurrente. Chargé à la demande :
    inutile de le trimballer dans la liste principale. */
export async function historique(tacheId) {
  const client = await clientSupabase();
  const { data, error } = await client
    .from('task_completions')
    .select('id, fait_le, fait_par, echeance_prevue, cout_reel')
    .eq('task_id', tacheId)
    .order('fait_le', { ascending: false })
    .limit(24);
  if (error) throw error;
  return data || [];
}

/* ------------------------------------------------------------- écritures --
   Toute écriture suit le même chemin : on l'applique localement, on rend la
   main à l'écran, puis on l'envoie. C'est ce qui donne une app utilisable
   dans une cave sans réseau comme dans le couloir.                          */

const nosEcritures = new Map();   // id → horodatage, pour ne pas se signaler
                                  // à soi-même les changements qu'on vient
                                  // de faire (le clignotement est là pour
                                  // montrer ce que l'AUTRE téléphone a fait).

function noterEcriture(id) {
  nosEcritures.set(id, Date.now());
  for (const [k, t] of nosEcritures) if (Date.now() - t > 6000) nosEcritures.delete(k);
}

function nouvelId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

async function executer(op) {
  const client = await clientSupabase();
  let r;
  if (op.type === 'insert') r = await client.from(op.table).insert(op.ligne);
  else if (op.type === 'update') r = await client.from(op.table).update(op.patch).eq('id', op.id);
  else if (op.type === 'delete') r = await client.from(op.table).delete().eq('id', op.id);
  else if (op.type === 'rpc') r = await client.rpc(op.fn, op.args);
  else throw new Error('Opération inconnue : ' + op.type);
  if (r.error) throw r.error;
  return r.data;
}

/** Envoie l'opération, ou la met en file si c'est le réseau qui manque. */
async function envoyer(op) {
  if (!etat.enLigne) {
    await fileAjouter(op);
    await majAttente();
    emettre({ raison: 'file' });
    return;
  }
  try {
    await executer(op);
  } catch (e) {
    if (estReseau(e)) {
      await fileAjouter(op);
      await majAttente();
      emettre({ raison: 'file' });
      return;
    }
    // Refusée par le serveur : l'écran montre une modification qui n'a pas
    // eu lieu. On remet la vérité avant de dire ce qui s'est passé.
    await toutCharger().catch(() => {});
    throw e;
  }
}

let rejeuEnCours = false;

/** Rejoue la file dans l'ordre. Une opération refusée par le serveur est
    retirée et signalée : la rejouer éternellement ne la ferait pas passer. */
export async function rejouer() {
  if (rejeuEnCours || !etat.enLigne || !etat.foyer) return;
  rejeuEnCours = true;
  try {
    const ops = await fileTout();
    for (const op of ops) {
      try {
        await executer(op);
        await fileRetirer(op.id);
      } catch (e) {
        if (estReseau(e)) break;               // on retentera plus tard
        await fileRetirer(op.id);
        etat.rejetees.push({ quoi: op.libelle || op.table, pourquoi: messageErreur(e) });
      }
    }
    await majAttente();
    if (ops.length) await toutCharger();
    emettre({ raison: 'rejeu' });
  } finally {
    rejeuEnCours = false;
  }
}

function majLocale(liste, ligne) {
  const i = liste.findIndex((x) => x.id === ligne.id);
  if (i === -1) liste.push(ligne); else liste[i] = { ...liste[i], ...ligne };
}

/* --- tâches --------------------------------------------------------------- */

export async function ajouterTache(champs) {
  const ligne = {
    id: nouvelId(),
    household_id: etat.foyer.id,
    created_by: etat.session?.user?.id ?? null,
    titre: champs.titre.trim(),
    notes: champs.notes ?? null,
    room_id: champs.room_id ?? null,
    nature: champs.nature || 'bricolage',
    statut: champs.statut || 'a_faire',
    priorite: champs.priorite || 'normale',
    echeance: champs.echeance ?? null,
    recurrence_mois: champs.recurrence_mois ?? null,
    cout_estime: champs.cout_estime ?? null,
    cout_reel: champs.cout_reel ?? null,
    assigne_a: champs.assigne_a ?? null,
    artisan_id: champs.artisan_id ?? null,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  etat.taches.push(ligne);
  noterEcriture(ligne.id);
  await sauverCache();
  emettre({ raison: 'ajout', id: ligne.id });
  await envoyer({ type: 'insert', table: 'tasks', ligne, libelle: ligne.titre });
  return ligne;
}

export async function modifierTache(id, patch) {
  majLocale(etat.taches, { id, ...patch });
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: 'modif', id });
  await envoyer({ type: 'update', table: 'tasks', id, patch, libelle: 'la tâche' });
}

export async function supprimerTache(id) {
  etat.taches = etat.taches.filter((t) => t.id !== id);
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: 'suppression', id });
  await envoyer({ type: 'delete', table: 'tasks', id, libelle: 'la suppression' });
}

/** Même calcul que la fonction SQL complete_task : on avance d'autant de
    cycles qu'il faut pour retomber dans le futur. Une tâche trimestrielle
    oubliée huit mois ne doit pas réapparaître en retard dès qu'on la coche. */
export function prochaineEcheance(echeance, mois) {
  const base = echeance ? new Date(echeance + 'T12:00:00') : new Date();
  const aujourdhui = new Date();
  aujourdhui.setHours(12, 0, 0, 0);
  const jourVoulu = base.getDate();
  let garde = 0;
  do {
    // On passe par le 1er du mois : sinon « 31 janvier + 1 mois » déborde sur
    // le 2 ou 3 mars en JavaScript, là où Postgres cale au 28 février.
    base.setDate(1);
    base.setMonth(base.getMonth() + mois);
    const dernierJour = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(jourVoulu, dernierJour));
    garde += 1;
  } while (base <= aujourdhui && garde < 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
}

/** Cocher. La règle métier vit dans la base (fonction complete_task) pour que
    les deux téléphones aboutissent au même résultat ; on la reproduit ici
    uniquement pour l'affichage immédiat. */
export async function cocherTache(id, coutReel = null) {
  const t = etat.taches.find((x) => x.id === id);
  if (!t) return null;
  const recurrente = t.recurrence_mois != null;
  const patch = recurrente
    ? { statut: 'a_faire', completed_at: null,
        echeance: prochaineEcheance(t.echeance, t.recurrence_mois),
        cout_reel: coutReel ?? t.cout_reel }
    : { statut: 'fait', completed_at: new Date().toISOString(),
        cout_reel: coutReel ?? t.cout_reel };

  majLocale(etat.taches, { id, ...patch });
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: recurrente ? 'recurrence' : 'coche', id });

  await envoyer({
    type: 'rpc', fn: 'complete_task',
    args: { p_task_id: id, p_cout_reel: coutReel },
    libelle: t.titre,
  });
  return { recurrente, echeance: patch.echeance };
}

export async function decocherTache(id) {
  majLocale(etat.taches, { id, statut: 'a_faire', completed_at: null });
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: 'decoche', id });
  await envoyer({ type: 'rpc', fn: 'uncomplete_task', args: { p_task_id: id }, libelle: 'l’annulation' });
}

/* --- pièces --------------------------------------------------------------- */

export async function ajouterPiece(nom) {
  const propre = nom.trim();
  const existe = etat.pieces.find((p) => p.nom.toLowerCase() === propre.toLowerCase());
  if (existe) return existe;
  const ligne = {
    id: nouvelId(), household_id: etat.foyer.id, nom: propre,
    position: 100 + etat.pieces.length,
  };
  etat.pieces.push(ligne);
  noterEcriture(ligne.id);
  await sauverCache();
  emettre({ raison: 'piece', id: ligne.id });
  await envoyer({ type: 'insert', table: 'rooms', ligne, libelle: propre });
  return ligne;
}

export async function renommerPiece(id, nom) {
  majLocale(etat.pieces, { id, nom: nom.trim() });
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: 'piece', id });
  await envoyer({ type: 'update', table: 'rooms', id, patch: { nom: nom.trim() }, libelle: nom });
}

export async function supprimerPiece(id) {
  etat.pieces = etat.pieces.filter((p) => p.id !== id);
  for (const t of etat.taches) if (t.room_id === id) t.room_id = null;
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: 'piece', id });
  await envoyer({ type: 'delete', table: 'rooms', id, libelle: 'la pièce' });
}

/* --- artisans ------------------------------------------------------------- */

export async function ajouterArtisan(champs) {
  const ligne = {
    id: nouvelId(), household_id: etat.foyer.id,
    nom: champs.nom.trim(),
    metier: champs.metier ?? null,
    telephone: champs.telephone ?? null,
    email: champs.email ?? null,
    notes: champs.notes ?? null,
    deja_utilise: !!champs.deja_utilise,
    appreciation: champs.appreciation ?? null,
  };
  etat.artisans.push(ligne);
  noterEcriture(ligne.id);
  await sauverCache();
  emettre({ raison: 'artisan', id: ligne.id });
  await envoyer({ type: 'insert', table: 'artisans', ligne, libelle: ligne.nom });
  return ligne;
}

export async function modifierArtisan(id, patch) {
  majLocale(etat.artisans, { id, ...patch });
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: 'artisan', id });
  await envoyer({ type: 'update', table: 'artisans', id, patch, libelle: "l’artisan" });
}

export async function supprimerArtisan(id) {
  etat.artisans = etat.artisans.filter((a) => a.id !== id);
  for (const t of etat.taches) if (t.artisan_id === id) t.artisan_id = null;
  noterEcriture(id);
  await sauverCache();
  emettre({ raison: 'artisan', id });
  await envoyer({ type: 'delete', table: 'artisans', id, libelle: "l’artisan" });
}

/* ------------------------------------------------------------ temps réel --
   L'intérêt concret : quand l'un coche « sortir les poubelles » dans la
   cuisine, la ligne disparaît de l'écran de l'autre sans qu'il rafraîchisse. */

let canal = null;

function fermerCanal() {
  if (canal && sb) { sb.removeChannel(canal); canal = null; }
}

async function abonnerTempsReel() {
  const client = await clientSupabase();
  fermerCanal();
  const foyer = etat.foyer?.id;
  if (!foyer) return;

  const brancher = (table) => ({
    event: '*', schema: 'public', table, filter: `household_id=eq.${foyer}`,
  });

  canal = client.channel(`foyer:${foyer}`)
    .on('postgres_changes', brancher('tasks'), (ev) => appliquer('taches', ev))
    .on('postgres_changes', brancher('rooms'), (ev) => appliquer('pieces', ev))
    .on('postgres_changes', brancher('artisans'), (ev) => appliquer('artisans', ev))
    .subscribe((statut) => {
      if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') {
        // Reconnexion douce : Supabase retente seul, on se contente de
        // resynchroniser quand ça repart.
        setTimeout(() => { if (etat.enLigne) toutCharger().catch(() => {}); }, 4000);
      }
    });
}

function appliquer(quoi, ev) {
  const liste = etat[quoi];
  const ligne = ev.new && Object.keys(ev.new).length ? ev.new : null;
  const id = ligne?.id || ev.old?.id;
  if (!id) return;

  if (ev.eventType === 'DELETE') {
    etat[quoi] = liste.filter((x) => x.id !== id);
  } else {
    majLocale(liste, ligne);
  }
  if (quoi === 'pieces') etat.pieces.sort((a, b) => (a.position - b.position) || a.nom.localeCompare(b.nom, 'fr'));

  const deNous = nosEcritures.has(id);
  sauverCache();
  emettre({ raison: 'tempsreel', quoi, id, signaler: !deNous });
}

/* ------------------------------------------------------------ connexion -- */

function surReseau() {
  const avant = etat.enLigne;
  etat.enLigne = navigator.onLine;
  if (etat.enLigne && !avant) {
    rejouer().then(() => { if (etat.foyer) toutCharger().catch(() => {}); });
  }
  emettre({ raison: 'reseau' });
}

window.addEventListener('online', surReseau);
window.addEventListener('offline', surReseau);

// Au retour au premier plan (on ressort le téléphone de sa poche), on
// resynchronise : le temps réel a pu manquer des événements pendant la veille.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && etat.phase === 'prete' && etat.enLigne) {
    rejouer().then(() => toutCharger().catch(() => {}));
  }
});
