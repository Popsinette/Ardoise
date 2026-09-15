/* ============================================================================
   Ardoise — couche de données, 100 % locale

   Aucun serveur, aucun compte, aucune connexion. Tout ce que vous notez reste
   sur ce téléphone, dans le stockage privé du navigateur (IndexedDB), isolé
   par origine. Rien n'est envoyé nulle part — l'app ne fait aucun appel
   réseau une fois installée.

   app.js ne touche jamais IndexedDB directement : il lit `etat` et appelle
   les fonctions d'ici.

   Une version synchronisée entre deux téléphones (Supabase + temps réel)
   existe dans l'historique git, au commit 84e874d.
   ========================================================================= */

const BASE = 'ardoise';
const VERSION_BASE = 2;
const MAGASINS = ['taches', 'pieces', 'artisans', 'passages', 'reglages'];

/* ------------------------------------------------------------------ état -- */

export const etat = {
  phase: 'demarrage',     // demarrage | prete | panne
  taches: [],
  pieces: [],
  artisans: [],
  passages: [],           // l'historique : une ligne par tâche cochée
  personnes: [],          // les prénoms du foyer, pour l'assignation
  erreur: null,
  persistant: null,       // le navigateur garde-t-il le stockage à l'abri ?
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

/* --------------------------------------------------------------- erreurs -- */

export function messageErreur(e) {
  if (!e) return 'Une erreur est survenue.';
  const brut = String(e.message || e).toLowerCase();
  if (brut.includes('quota') || e.name === 'QuotaExceededError') {
    return "Le stockage du téléphone est plein. Exportez vos données, puis faites de la place.";
  }
  if (brut.includes('indexeddb') || e.name === 'InvalidStateError') {
    return "Le stockage du navigateur est inaccessible. En navigation privée, Safari le bloque : ouvrez Ardoise depuis l'écran d'accueil.";
  }
  return e.message || 'Une erreur est survenue.';
}

/* -------------------------------------------------------------- la base -- */

let dbPromise = null;

function ouvrirBase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, VERSION_BASE);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const nom of MAGASINS) {
        if (!db.objectStoreNames.contains(nom)) {
          db.createObjectStore(nom, { keyPath: nom === 'reglages' ? 'clef' : 'id' });
        }
      }
      // Reliquats de la version synchronisée : cache réseau et file d'envoi
      // n'ont plus lieu d'être maintenant que tout est local.
      for (const ancien of ['cache', 'file']) {
        if (db.objectStoreNames.contains(ancien)) db.deleteObjectStore(ancien);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(
      'Ardoise est ouverte dans un autre onglet. Fermez-le et rechargez.'));
  });
  return dbPromise;
}

function transaction(db, magasins, mode, action) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(magasins, mode);
    let resultat;
    try { resultat = action(...magasins.map((m) => t.objectStore(m))); }
    catch (e) { reject(e); return; }
    t.onabort = () => reject(t.error);
    t.onerror = () => reject(t.error);
    t.oncomplete = () => resolve(resultat && resultat.result !== undefined ? resultat.result : resultat);
  });
}

const lireTout = async (magasin) =>
  (await transaction(await ouvrirBase(), [magasin], 'readonly', (s) => s.getAll())) || [];

const ecrire = async (magasin, ligne) =>
  transaction(await ouvrirBase(), [magasin], 'readwrite', (s) => s.put(ligne));

const effacer = async (magasin, id) =>
  transaction(await ouvrirBase(), [magasin], 'readwrite', (s) => s.delete(id));

async function reglage(clef, valeur) {
  if (valeur === undefined) {
    const l = await transaction(await ouvrirBase(), ['reglages'], 'readonly', (s) => s.get(clef));
    return l ? l.valeur : undefined;
  }
  return ecrire('reglages', { clef, valeur });
}

/* ------------------------------------------------------------ démarrage -- */

/** Les pièces d'une maison ordinaire, posées au premier lancement. Elles se
    renomment et se suppriment dans les réglages — c'est un point de départ,
    pas une contrainte. */
const PIECES_INITIALES = [
  'Cuisine', 'Salon', 'Salle à manger', 'Chambre', 'Salle de bain', 'Toilettes',
  'Entrée', 'Couloir', 'Bureau', 'Buanderie', 'Cave', 'Grenier', 'Combles',
  'Garage', 'Toiture', 'Façade', 'Jardin', 'Terrasse', 'Chauffage',
  'Électricité', 'Plomberie',
];

export async function demarrer() {
  try {
    await ouvrirBase();

    // iOS efface le stockage des sites peu visités. Une app ajoutée à l'écran
    // d'accueil y échappe, mais on demande quand même explicitement à le
    // garder : c'est gratuit et ça ferme une porte de moins.
    if (navigator.storage && navigator.storage.persist) {
      try {
        etat.persistant = (await navigator.storage.persisted()) || (await navigator.storage.persist());
      } catch { etat.persistant = null; }
    }

    const dejaLance = await reglage('installee');
    if (!dejaLance) {
      const db = await ouvrirBase();
      await transaction(db, ['pieces'], 'readwrite', (s) => {
        PIECES_INITIALES.forEach((nom, i) => s.put({ id: nouvelId(), nom, position: (i + 1) * 10 }));
      });
      await reglage('installee', new Date().toISOString());
    }

    await toutCharger();
    etat.phase = 'prete';
    emettre({ raison: 'demarrage' });
  } catch (e) {
    etat.phase = 'panne';
    etat.erreur = messageErreur(e);
    emettre({ raison: 'panne' });
  }
}

export async function toutCharger() {
  const [taches, pieces, artisans, passages, personnes] = await Promise.all([
    lireTout('taches'), lireTout('pieces'), lireTout('artisans'), lireTout('passages'),
    reglage('personnes'),
  ]);
  etat.taches = taches;
  etat.pieces = pieces.sort((a, b) => (a.position - b.position) || a.nom.localeCompare(b.nom, 'fr'));
  etat.artisans = artisans;
  etat.passages = passages;
  etat.personnes = personnes || [];
}

function nouvelId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

/* --------------------------------------------------------------- tâches -- */

export async function ajouterTache(champs) {
  const ligne = {
    id: nouvelId(),
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
    assigne_a: champs.assigne_a ?? null,     // un prénom, pas un identifiant
    artisan_id: champs.artisan_id ?? null,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  await ecrire('taches', ligne);
  etat.taches.push(ligne);
  emettre({ raison: 'ajout', id: ligne.id });
  return ligne;
}

export async function modifierTache(id, patch) {
  const i = etat.taches.findIndex((t) => t.id === id);
  if (i === -1) return;
  const ligne = { ...etat.taches[i], ...patch };
  await ecrire('taches', ligne);
  etat.taches[i] = ligne;
  emettre({ raison: 'modif', id });
}

export async function supprimerTache(id) {
  await effacer('taches', id);
  const db = await ouvrirBase();
  const aRetirer = etat.passages.filter((p) => p.task_id === id);
  if (aRetirer.length) {
    await transaction(db, ['passages'], 'readwrite', (s) => {
      for (const p of aRetirer) s.delete(p.id);
    });
  }
  etat.taches = etat.taches.filter((t) => t.id !== id);
  etat.passages = etat.passages.filter((p) => p.task_id !== id);
  emettre({ raison: 'suppression', id });
}

/** L'échéance suivante d'une tâche récurrente. On avance d'autant de cycles
    qu'il faut pour retomber dans le futur : une tâche trimestrielle oubliée
    pendant huit mois ne doit pas réapparaître en retard à la seconde où on
    vient de la faire. */
export function prochaineEcheance(echeance, mois) {
  const base = echeance ? new Date(echeance + 'T12:00:00') : new Date();
  base.setHours(12, 0, 0, 0);
  const aujourdhui = new Date();
  aujourdhui.setHours(12, 0, 0, 0);
  const jourVoulu = base.getDate();
  let garde = 0;
  do {
    // On passe par le 1er du mois : sinon « 31 janvier + 1 mois » déborde sur
    // le 2 ou 3 mars, là où on attend le 28 février.
    base.setDate(1);
    base.setMonth(base.getMonth() + mois);
    const dernierJour = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(jourVoulu, dernierJour));
    garde += 1;
  } while (base <= aujourdhui && garde < 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
}

/** Cocher. Une tâche récurrente n'est jamais archivée : on garde la trace du
    passage et son échéance avance. L'historique, lui, ne bouge plus. */
export async function cocherTache(id, coutReel = null) {
  const t = etat.taches.find((x) => x.id === id);
  if (!t) return null;

  const passage = {
    id: nouvelId(),
    task_id: t.id,
    fait_le: new Date().toISOString(),
    fait_par: t.assigne_a ?? null,
    echeance_prevue: t.echeance ?? null,
    cout_reel: coutReel ?? t.cout_reel ?? null,
  };
  await ecrire('passages', passage);
  etat.passages.push(passage);

  const recurrente = t.recurrence_mois != null;
  const patch = recurrente
    ? { statut: 'a_faire', completed_at: null,
        echeance: prochaineEcheance(t.echeance, t.recurrence_mois),
        cout_reel: coutReel ?? t.cout_reel }
    : { statut: 'fait', completed_at: new Date().toISOString(),
        cout_reel: coutReel ?? t.cout_reel };

  await modifierTache(id, patch);
  emettre({ raison: recurrente ? 'recurrence' : 'coche', id });
  return { recurrente, echeance: patch.echeance };
}

/** Annuler une coche : on se trompe de ligne un jour sur dix. Le dernier
    passage est effacé et l'échéance d'avant est rendue. */
export async function decocherTache(id) {
  const t = etat.taches.find((x) => x.id === id);
  if (!t) return;
  const passages = etat.passages
    .filter((p) => p.task_id === id)
    .sort((a, b) => b.fait_le.localeCompare(a.fait_le));
  const dernier = passages[0];
  if (dernier) {
    await effacer('passages', dernier.id);
    etat.passages = etat.passages.filter((p) => p.id !== dernier.id);
  }
  await modifierTache(id, {
    statut: 'a_faire',
    completed_at: null,
    echeance: dernier ? (dernier.echeance_prevue ?? t.echeance) : t.echeance,
  });
  emettre({ raison: 'decoche', id });
}

/** Les passages d'une tâche, du plus récent au plus ancien. */
export async function historique(tacheId) {
  return etat.passages
    .filter((p) => p.task_id === tacheId)
    .sort((a, b) => b.fait_le.localeCompare(a.fait_le))
    .slice(0, 24);
}

/* --------------------------------------------------------------- pièces -- */

export async function ajouterPiece(nom) {
  const propre = nom.trim();
  const existe = etat.pieces.find((p) => p.nom.toLowerCase() === propre.toLowerCase());
  if (existe) return existe;
  const ligne = { id: nouvelId(), nom: propre, position: 1000 + etat.pieces.length };
  await ecrire('pieces', ligne);
  etat.pieces.push(ligne);
  emettre({ raison: 'piece', id: ligne.id });
  return ligne;
}

export async function renommerPiece(id, nom) {
  const i = etat.pieces.findIndex((p) => p.id === id);
  if (i === -1) return;
  const ligne = { ...etat.pieces[i], nom: nom.trim() };
  await ecrire('pieces', ligne);
  etat.pieces[i] = ligne;
  emettre({ raison: 'piece', id });
}

/** Supprimer une pièce ne supprime pas ses tâches : elles retombent dans
    « Sans pièce ». Perdre une pièce par mégarde ne doit pas emporter le
    travail qu'on y avait noté. */
export async function supprimerPiece(id) {
  await effacer('pieces', id);
  etat.pieces = etat.pieces.filter((p) => p.id !== id);
  for (const t of etat.taches.filter((x) => x.room_id === id)) {
    await modifierTache(t.id, { room_id: null });
  }
  emettre({ raison: 'piece', id });
}

/* ------------------------------------------------------------- artisans -- */

export async function ajouterArtisan(champs) {
  const ligne = {
    id: nouvelId(),
    nom: champs.nom.trim(),
    metier: champs.metier ?? null,
    telephone: champs.telephone ?? null,
    email: champs.email ?? null,
    notes: champs.notes ?? null,
    deja_utilise: !!champs.deja_utilise,
    appreciation: champs.appreciation ?? null,
  };
  await ecrire('artisans', ligne);
  etat.artisans.push(ligne);
  emettre({ raison: 'artisan', id: ligne.id });
  return ligne;
}

export async function modifierArtisan(id, patch) {
  const i = etat.artisans.findIndex((a) => a.id === id);
  if (i === -1) return;
  const ligne = { ...etat.artisans[i], ...patch };
  await ecrire('artisans', ligne);
  etat.artisans[i] = ligne;
  emettre({ raison: 'artisan', id });
}

export async function supprimerArtisan(id) {
  await effacer('artisans', id);
  etat.artisans = etat.artisans.filter((a) => a.id !== id);
  for (const t of etat.taches.filter((x) => x.artisan_id === id)) {
    await modifierTache(t.id, { artisan_id: null });
  }
  emettre({ raison: 'artisan', id });
}

/* ------------------------------------------------------------- personnes -- */

export async function definirPersonnes(liste) {
  const propres = [...new Set(liste.map((p) => p.trim()).filter(Boolean))].slice(0, 8);
  await reglage('personnes', propres);
  etat.personnes = propres;
  // Une personne retirée de la liste ne doit pas rester assignée à des tâches
  // où plus personne ne la reconnaît.
  for (const t of etat.taches.filter((x) => x.assigne_a && !propres.includes(x.assigne_a))) {
    await modifierTache(t.id, { assigne_a: null });
  }
  emettre({ raison: 'personnes' });
}

/* -------------------------------------------------- sauvegarde et reprise --
   Sans serveur, l'export est la seule sauvegarde — et le seul moyen de
   passer sa liste à l'autre téléphone. Il passe par la feuille de partage
   du système quand elle accepte les fichiers (Safari iOS le fait), sinon
   par un téléchargement. */

export function instantane() {
  return {
    app: 'Ardoise',
    version: 1,
    exporte_le: new Date().toISOString(),
    donnees: {
      taches: etat.taches,
      pieces: etat.pieces,
      artisans: etat.artisans,
      passages: etat.passages,
      personnes: etat.personnes,
    },
  };
}

export async function exporter() {
  const contenu = JSON.stringify(instantane(), null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const nom = `ardoise-${date}.json`;
  const blob = new Blob([contenu], { type: 'application/json' });

  const fichier = new File([blob], nom, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Sauvegarde Ardoise' });
      return 'partage';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'annule';
      // Le partage a échoué pour une autre raison : on retombe sur le
      // téléchargement plutôt que de laisser l'utilisateur sans sauvegarde.
    }
  }

  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
  return 'telecharge';
}

/** Remplace tout le contenu par celui d'une sauvegarde. Destructif et
    assumé : l'écran demande confirmation avant d'arriver ici. */
export async function importer(texte) {
  let charge;
  try { charge = JSON.parse(texte); }
  catch { throw new Error("Ce fichier n'est pas une sauvegarde Ardoise lisible."); }

  if (!charge || charge.app !== 'Ardoise' || !charge.donnees) {
    throw new Error("Ce fichier ne vient pas d'Ardoise. Choisissez un fichier ardoise-….json.");
  }

  const d = charge.donnees;
  const listes = {
    taches: Array.isArray(d.taches) ? d.taches : [],
    pieces: Array.isArray(d.pieces) ? d.pieces : [],
    artisans: Array.isArray(d.artisans) ? d.artisans : [],
    passages: Array.isArray(d.passages) ? d.passages : [],
  };

  const db = await ouvrirBase();
  await transaction(db, MAGASINS, 'readwrite', (taches, pieces, artisans, passages, reglages) => {
    const magasins = { taches, pieces, artisans, passages };
    for (const [nom, magasin] of Object.entries(magasins)) {
      magasin.clear();
      for (const ligne of listes[nom]) if (ligne && ligne.id) magasin.put(ligne);
    }
    reglages.put({ clef: 'personnes', valeur: Array.isArray(d.personnes) ? d.personnes : [] });
    reglages.put({ clef: 'installee', valeur: new Date().toISOString() });
  });

  await toutCharger();
  emettre({ raison: 'import' });
  return listes.taches.length;
}

/** Tout effacer. Le seul chemin de retour est une sauvegarde. */
export async function toutEffacer() {
  const db = await ouvrirBase();
  await transaction(db, MAGASINS, 'readwrite', (...magasins) => {
    for (const m of magasins) m.clear();
  });
  etat.taches = []; etat.artisans = []; etat.passages = []; etat.pieces = []; etat.personnes = [];
  await demarrer();
}
