/* ============================================================================
   Ardoise — logique et vues

   Rendu impératif, sans bibliothèque : l'app compte quatre écrans et deux
   fiches, une couche de réactivité coûterait plus cher qu'elle ne rapporte.
   La règle tenue partout : les données de l'utilisateur passent par
   textContent, jamais par innerHTML — seules les icônes, écrites ici, y ont
   droit.
   ========================================================================= */

import * as D from './data.js';

/* ------------------------------------------------------------------ DOM -- */

const racine = document.getElementById('app');

function h(balise, attrs, ...enfants) {
  const el = document.createElement(balise);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'texte') el.textContent = v;
    else if (k === 'icone') el.appendChild(icone(v));
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const enfant of enfants.flat()) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    el.appendChild(typeof enfant === 'string' ? document.createTextNode(enfant) : enfant);
  }
  return el;
}

/* --------------------------------------------------------------- icônes --
   Dessinées à la main, trait de 1.6, même grille de 24 : elles doivent avoir
   l'air d'être de la même main que la typographie.                          */

const TRACES = {
  // Une ardoise de toiture : rectangle à base arrondie, avec sa coche de craie.
  ardoise: '<path d="M5.2 3.2h13.6v11.2a6.8 6.8 0 0 1-13.6 0z"/><path d="M9 10.4l2.3 2.4 4-4.4"/>',
  liste: '<path d="M4 6.6h16M4 12h16M4 17.4h10.5"/>',
  // Une clé plate. La truelle, la scie et le marteau ont été essayés : à
  // 21 px la truelle devient un entonnoir (l'icône de filtre juste à côté),
  // la scie un drapeau, et le marteau une bouillie.
  cle: '<path d="M18.6 3.4a5 5 0 0 0-6.4 6.4l-8 8a1.9 1.9 0 0 0 2.6 2.6l8-8a5 5 0 0 0 6.4-6.4l-2.9 2.9-2.6-.6-.6-2.6z"/>',
  combine: '<path d="M6.4 3.6h3.1l1.3 3.6-2 1.4a11.6 11.6 0 0 0 5.6 5.6l1.4-2 3.6 1.3v3.1c0 .9-.8 1.7-1.7 1.6-7.3-.8-12-5.5-12.9-12.9-.1-.9.7-1.7 1.6-1.7z"/>',
  craie: '<path d="M4 20l1.1-4.2L15.7 5.2l3.1 3.1L8.2 18.9z"/><path d="M13.6 7.3l3.1 3.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  retour: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  croix: '<path d="M6 6l12 12M18 6L6 18"/>',
  reglages: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/>',
  telephone: '<path d="M6.4 3.6h3.1l1.3 3.6-2 1.4a11.6 11.6 0 0 0 5.6 5.6l1.4-2 3.6 1.3v3.1c0 .9-.8 1.7-1.7 1.6-7.3-.8-12-5.5-12.9-12.9-.1-.9.7-1.7 1.6-1.7z"/>',
  courriel: '<path d="M3.5 6.5h17v11h-17z"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  filtre: '<path d="M3.5 6h17M6.5 12h11M10 18h4"/>',
};

function icone(nom, taille = 22) {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.style.display = 'inline-flex';
  span.innerHTML =
    `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ` +
    `stroke-linejoin="round">${TRACES[nom] || ''}</svg>`;
  return span;
}

/* ------------------------------------------------------------ formatage -- */

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function dateLocale(iso) { return new Date(iso + 'T12:00:00'); }

function isoDuJour(decalage = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ecartJours(iso) {
  const a = dateLocale(iso), b = dateLocale(isoDuJour());
  return Math.round((a - b) / 86400000);
}

/** « jeu. 17 » dans la semaine, « 17 déc. » au-delà, « 17 déc. 2027 » ailleurs. */
function dateCourte(iso) {
  if (!iso) return '';
  const d = dateLocale(iso), e = ecartJours(iso);
  if (e === 0) return "aujourd'hui";
  if (e === 1) return 'demain';
  if (e === -1) return 'hier';
  if (e > 1 && e < 7) return `${JOURS_COURTS[d.getDay()]} ${d.getDate()}`;
  const annee = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}${annee}`;
}

/** Le retard se dit en toutes lettres. Hors de la section « En retard » —
    dans Tout, groupé par pièce — un « 11 jours » tout seul se lisait aussi
    bien « dans 11 jours ». Sur une échéance, l'ambiguïté n'est pas permise. */
function retardLisible(iso) {
  const j = -ecartJours(iso);
  if (j <= 0) return dateCourte(iso);
  if (j === 1) return 'depuis hier';
  if (j < 31) return `${j} jours de retard`;
  const mois = Math.round(j / 30.4);
  if (mois < 12) return `${mois} mois de retard`;
  const ans = Math.floor(mois / 12);
  return ans === 1 ? 'plus d’un an de retard' : `${ans} ans de retard`;
}

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

function montant(n) {
  if (n === null || n === undefined || n === '') return null;
  return euros.format(Number(n));
}

const RECURRENCES = [
  [null, 'Ponctuelle'], [1, 'Tous les mois'], [2, 'Tous les 2 mois'],
  [3, 'Tous les 3 mois'], [4, 'Tous les 4 mois'], [6, 'Tous les 6 mois'],
  [12, 'Tous les ans'], [24, 'Tous les 2 ans'], [60, 'Tous les 5 ans'],
];

function recurrenceLisible(mois) {
  if (mois == null) return null;
  const trouve = RECURRENCES.find(([m]) => m === mois);
  return trouve ? trouve[1].toLowerCase() : `tous les ${mois} mois`;
}

const NATURES = [['bricolage', 'Bricolage'], ['artisan', 'Artisan'], ['entretien', 'Entretien']];
const STATUTS = [['a_faire', 'À faire'], ['devis', 'Devis'], ['planifie', 'Planifié'], ['fait', 'Fait']];
const PRIORITES = [['basse', 'Basse'], ['normale', 'Normale'], ['haute', 'Haute']];

const libelle = (table, clef) => (table.find(([c]) => c === clef) || [null, '—'])[1];
const rangStatut = (s) => STATUTS.findIndex(([c]) => c === s) + 1;

function nomPiece(id) {
  const p = D.etat.pieces.find((x) => x.id === id);
  return p ? p.nom : null;
}

function nomArtisan(id) {
  const a = D.etat.artisans.find((x) => x.id === id);
  return a ? a.nom : null;
}

const estEnRetard = (t) =>
  t.statut !== 'fait' && t.echeance && ecartJours(t.echeance) < 0;

/* ---------------------------------------------------------- composants -- */

/** La graduation : un mètre de menuisier. Sert à l'avancement d'un chantier
    et à l'appréciation d'un artisan — un seul motif, deux usages. */
function graduation(rempli, total, laiton = false) {
  const g = h('span', {
    class: 'grad' + (laiton ? ' grad--laiton' : ''),
    'aria-hidden': 'true',
  });
  for (let i = 0; i < total; i += 1) {
    g.appendChild(h('i', i < rempli ? { 'data-plein': '' } : {}));
  }
  return g;
}

function etatVide(titre, texte, action) {
  return h('div', { class: 'vide' },
    h('p', { class: 'vide__titre', texte: titre }),
    h('p', { class: 'vide__texte', texte }),
    action ? h('div', { class: 'vide__action' }, action) : null,
  );
}

function section(titre, compte, contenu, modificateur) {
  return h('section', { class: 'section' + (modificateur ? ' ' + modificateur : '') },
    h('div', { class: 'section__tete' },
      h('h2', { class: 't-piece', texte: titre }),
      compte != null ? h('span', { class: 'section__compte', texte: String(compte) }) : null,
    ),
    contenu,
  );
}

/** Une ligne de relevé : coche, corps, montant. */
function ligneTache(t, options = {}) {
  const retard = estEnRetard(t);
  const recurrente = t.recurrence_mois != null;
  const faite = t.statut === 'fait';

  // On construit la méta comme une liste de textes : le DOM et le nom
  // accessible en sortent tous les deux, et la synthèse vocale ne lit plus
  // « Ramoner le poêleSalon11 jours ».
  const morceaux = [];
  if (options.montrerPiece !== false && t.room_id) {
    morceaux.push({ texte: nomPiece(t.room_id) || 'Pièce supprimée', classe: 'ligne__piece' });
  }
  if (t.echeance && options.montrerEcheance !== false) {
    morceaux.push({
      texte: retard ? retardLisible(t.echeance) : dateCourte(t.echeance),
      classe: 'ligne__echeance',
    });
  }
  if (recurrente) morceaux.push({ texte: recurrenceLisible(t.recurrence_mois) });
  if (t.nature === 'artisan' && t.statut !== 'a_faire' && !faite) {
    morceaux.push({ texte: libelle(STATUTS, t.statut).toLowerCase() });
  }
  if (t.assigne_a) morceaux.push({ texte: t.assigne_a });

  const meta = h('div', { class: 'ligne__meta' });
  for (const m of morceaux) meta.appendChild(h('span', { class: m.classe, texte: m.texte }));

  // Estimé ou réel : la nuance passe par la couleur et la graisse. Un « ~ »
  // collé devant un prix se lit comme un signe moins, ce qui sur de l'argent
  // n'est pas une approximation acceptable.
  const somme = t.cout_reel ?? t.cout_estime;
  const estime = t.cout_reel == null && t.cout_estime != null;
  const montantEl = somme != null
    ? h('span', {
        class: 'ligne__montant' + (estime ? ' ligne__montant--estime' : ''),
        texte: montant(somme),
      })
    : null;

  const coche = h('button', {
    class: 'coche' + (recurrente ? ' coche--recurrente' : ''),
    type: 'button',
    'aria-pressed': faite ? 'true' : 'false',
    'aria-label': faite ? `Annuler « ${t.titre} »` : `Marquer « ${t.titre} » comme fait`,
  },
    h('span', { class: 'coche__case' }, (() => {
      const s = document.createElement('span');
      s.setAttribute('aria-hidden', 'true');
      s.style.display = 'inline-flex';
      s.innerHTML = '<svg class="coche__trait" viewBox="0 0 16 16"><path d="M3 8.4l3.2 3.4L13 4.6"/></svg>';
      return s;
    })()),
  );

  const description = [t.titre, ...morceaux.map((m) => m.texte),
    somme != null ? (estime ? 'estimé à ' : '') + montant(somme) : null]
    .filter(Boolean).join(', ');

  const li = h('li', {
    class: 'ligne'
      + (retard ? ' ligne--retard' : '')
      + (faite ? ' ligne--faite' : '')
      + (t.priorite === 'haute' && !faite ? ' ligne--haute' : ''),
    dataset: { tache: t.id },
  },
    coche,
    h('button', { class: 'ligne__corps', type: 'button',
      'aria-label': `Ouvrir : ${description}`,
      onclick: () => ouvrirFicheTache(t.id) },
      h('span', { class: 'ligne__titre', texte: t.titre }),
      meta.childElementCount ? meta : null,
    ),
    options.montantChantier ? montantChantier(t) : montantEl,
  );

  coche.addEventListener('click', () => basculerCoche(t, li, coche));
  return li;
}

/** Sur l'écran Chantiers, le couple estimé / réel est l'information : il
    prend deux lignes plutôt que d'être écrasé sur une seule. */
function montantChantier(t) {
  const bloc = h('span', { class: 'ligne__montant ligne__montant--double' });
  if (t.cout_reel != null) {
    bloc.appendChild(h('span', { class: 'reel', texte: montant(t.cout_reel) }));
  }
  if (t.cout_estime != null) {
    bloc.appendChild(h('span', {
      class: 'estime',
      texte: 'est. ' + montant(t.cout_estime),
    }));
  }
  if (!bloc.childElementCount) return null;
  return bloc;
}

/* --------------------------------------------------------------- coche -- */

async function basculerCoche(t, li, bouton) {
  const faite = t.statut === 'fait';
  bouton.setAttribute('aria-pressed', faite ? 'false' : 'true');
  try {
    if (faite) {
      await D.decocherTache(t.id);
      rendre();
      return;
    }
    const resultat = await D.cocherTache(t.id);
    if (resultat && resultat.recurrente) {
      // Récurrente : la ligne reste, c'est sa nouvelle échéance qui est
      // l'information. On la montre bouger avant de redessiner.
      const champ = li.querySelector('.ligne__echeance');
      if (champ) {
        champ.textContent = dateCourte(resultat.echeance);
        champ.classList.add('ligne__echeance--avance');
      }
      li.classList.remove('ligne--retard');
      setTimeout(rendre, 750);
    } else {
      li.classList.add('ligne--sort');
      setTimeout(rendre, 280);
    }
  } catch (e) {
    bouton.setAttribute('aria-pressed', faite ? 'true' : 'false');
    signaler(D.messageErreur(e));
    rendre();
  }
}

/* ================================================================ écrans == */

const vue = {
  onglet: 'semaine',
  fiche: null,                 // { type: 'tache' | 'artisan', id }
  filtres: { piece: null, nature: null, statut: null, personne: null, terminees: false },
  groupement: 'piece',
  dernierePiece: null,         // mémorisée : l'ajout suivant est souvent dans
                               // la même pièce, et ça enlève un geste.
};

const ONGLETS = [
  ['semaine', 'Semaine', 'ardoise'],
  ['tout', 'Tout', 'liste'],
  ['chantiers', 'Chantiers', 'cle'],
  ['artisans', 'Artisans', 'combine'],
];

function entete(titre, ...aDroite) {
  return h('header', { class: 'entete' },
    h('h1', { class: 't-ecran', texte: titre }),
    h('div', { class: 'entete__actions' },
      ...aDroite,
      h('button', {
        class: 'entete__reglages', type: 'button',
        'aria-label': 'Réglages', icone: 'reglages',
        onclick: ouvrirReglages,
      }),
    ),
  );
}

/* --------------------------------------------------------- Cette semaine --
   L'écran d'ouverture. Le retard d'abord, puis les sept jours qui viennent,
   dans l'ordre. L'axe est le temps ; la pièce reste l'élément le plus
   accrocheur à l'intérieur de chaque ligne.                                 */

function ecranSemaine() {
  const ecran = h('div', { class: 'ecran' });
  const jour = new Date();
  const dateDuJour = `${JOURS_COURTS[jour.getDay()]} ${jour.getDate()} ${MOIS_COURTS[jour.getMonth()]}`;

  ecran.appendChild(entete('Cette semaine',
    h('span', { class: 'entete__date', texte: dateDuJour })));

  const aujourdhui = isoDuJour();
  const limite = isoDuJour(7);
  const actives = D.etat.taches.filter((t) => t.statut !== 'fait' && t.echeance);

  const retard = actives.filter((t) => t.echeance < aujourdhui)
    .sort((a, b) => a.echeance.localeCompare(b.echeance));
  const aVenir = actives.filter((t) => t.echeance >= aujourdhui && t.echeance <= limite)
    .sort((a, b) => a.echeance.localeCompare(b.echeance) || a.titre.localeCompare(b.titre, 'fr'));

  if (!retard.length && !aVenir.length) {
    const sansEcheance = D.etat.taches.filter((t) => t.statut !== 'fait' && !t.echeance).length;
    ecran.appendChild(etatVide(
      'Rien d’ici le ' + dateCourte(limite) + '.',
      sansEcheance
        ? `Aucune échéance cette semaine. ${sansEcheance} tâche${sansEcheance > 1 ? 's' : ''} attend${sansEcheance > 1 ? 'ent' : ''} sans date dans l’onglet Tout : donnez-en une à celle qui vous pèse le plus.`
        : 'Aucune échéance ni retard. Profitez-en, ou notez ce qui traîne — la ligne d’écriture est en bas.',
      sansEcheance
        ? h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Voir les tâches sans date',
            onclick: () => { vue.filtres = { ...vue.filtres, statut: null }; vue.groupement = 'echeance'; allerA('tout'); } })
        : null,
    ));
    return ecran;
  }

  if (retard.length) {
    const liste = h('ul', { class: 'liste' });
    for (const t of retard) liste.appendChild(ligneTache(t));
    ecran.appendChild(section('En retard', retard.length, liste, 'section--retard'));
  }

  const parJour = new Map();
  for (const t of aVenir) {
    if (!parJour.has(t.echeance)) parJour.set(t.echeance, []);
    parJour.get(t.echeance).push(t);
  }
  for (const [iso, taches] of parJour) {
    const d = dateLocale(iso);
    const e = ecartJours(iso);
    const titre = e === 0 ? "Aujourd'hui"
      : e === 1 ? 'Demain'
      : `${JOURS_LONGS[d.getDay()]} ${d.getDate()}`;
    const liste = h('ul', { class: 'liste' });
    for (const t of taches) liste.appendChild(ligneTache(t, { montrerEcheance: false }));
    ecran.appendChild(section(titre, taches.length, liste));
  }

  return ecran;
}

/* ------------------------------------------------------------------ Tout --
   La liste complète, filtrable, groupée par pièce par défaut.               */

function filtresActifs() {
  const f = vue.filtres;
  return !!(f.piece || f.nature || f.statut || f.personne);
}

function ecranTout() {
  const ecran = h('div', { class: 'ecran' });
  const f = vue.filtres;

  const resume = [];
  if (f.piece) resume.push(nomPiece(f.piece) || 'Pièce');
  if (f.nature) resume.push(libelle(NATURES, f.nature));
  if (f.statut) resume.push(libelle(STATUTS, f.statut));
  if (f.personne) resume.push(f.personne === 'aucune' ? 'Non assignées' : f.personne);

  ecran.appendChild(entete('Tout',
    h('button', {
      class: 'bouton bouton--texte' + (filtresActifs() ? ' filtre-actif' : ''),
      type: 'button', onclick: ouvrirFiltres,
    }, icone('filtre', 20), h('span', { texte: resume.length ? resume.join(' · ') : 'Filtrer' })),
  ));

  let taches = D.etat.taches.slice();
  if (f.piece) taches = taches.filter((t) => t.room_id === f.piece);
  if (f.nature) taches = taches.filter((t) => t.nature === f.nature);
  if (f.statut) taches = taches.filter((t) => t.statut === f.statut);
  if (f.personne === 'aucune') taches = taches.filter((t) => !t.assigne_a);
  else if (f.personne) taches = taches.filter((t) => t.assigne_a === f.personne);

  const terminees = taches.filter((t) => t.statut === 'fait');
  if (!vue.filtres.terminees && f.statut !== 'fait') {
    taches = taches.filter((t) => t.statut !== 'fait');
  }

  if (!taches.length) {
    if (filtresActifs()) {
      ecran.appendChild(etatVide(
        'Aucune tâche avec ces filtres.',
        'Il y a peut-être autre chose à faire ailleurs dans la maison.',
        h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Effacer les filtres',
          onclick: () => { vue.filtres = { piece: null, nature: null, statut: null, personne: null, terminees: false }; rendre(); } }),
      ));
    } else if (!D.etat.taches.length) {
      ecran.appendChild(etatVide(
        'L’ardoise est vierge.',
        'Notez la première chose à faire : changer un joint, rappeler le couvreur, purger les radiateurs. Le coût, l’échéance et l’artisan se complètent plus tard.',
        h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Écrire la première tâche',
          onclick: () => ouvrirAjout() }),
      ));
    } else {
      ecran.appendChild(etatVide(
        'Tout est fait.',
        `${terminees.length} tâche${terminees.length > 1 ? 's terminées' : ' terminée'} et rien en attente. C’est rare, ça se note.`,
        terminees.length ? boutonTerminees(terminees.length) : null,
      ));
    }
    return ecran;
  }

  const groupes = grouper(taches);
  for (const [titre, liste] of groupes) {
    const ul = h('ul', { class: 'liste' });
    for (const t of liste) {
      ul.appendChild(ligneTache(t, { montrerPiece: vue.groupement !== 'piece' }));
    }
    ecran.appendChild(section(titre, liste.length, ul));
  }

  if (terminees.length && !vue.filtres.terminees && f.statut !== 'fait') {
    ecran.appendChild(h('div', { class: 'pied-liste' }, boutonTerminees(terminees.length)));
  }
  return ecran;
}

function boutonTerminees(n) {
  return h('button', {
    class: 'bouton bouton--trait', type: 'button',
    texte: `Afficher les ${n} tâche${n > 1 ? 's' : ''} terminée${n > 1 ? 's' : ''}`,
    onclick: () => { vue.filtres.terminees = true; rendre(); },
  });
}

function grouper(taches) {
  const groupes = new Map();
  const pousser = (clef, t) => {
    if (!groupes.has(clef)) groupes.set(clef, []);
    groupes.get(clef).push(t);
  };

  if (vue.groupement === 'echeance') {
    const aujourdhui = isoDuJour();
    for (const t of taches) {
      if (t.statut === 'fait') pousser('Terminées', t);
      else if (!t.echeance) pousser('Sans date', t);
      else if (t.echeance < aujourdhui) pousser('En retard', t);
      else if (t.echeance <= isoDuJour(7)) pousser('Cette semaine', t);
      else if (t.echeance <= isoDuJour(31)) pousser('Ce mois-ci', t);
      else pousser('Plus tard', t);
    }
    const ordre = ['En retard', 'Cette semaine', 'Ce mois-ci', 'Plus tard', 'Sans date', 'Terminées'];
    return ordre.filter((c) => groupes.has(c)).map((c) => [c, triDansGroupe(groupes.get(c))]);
  }

  if (vue.groupement === 'nature') {
    for (const t of taches) pousser(libelle(NATURES, t.nature), t);
    return NATURES.map(([, nom]) => nom).filter((n) => groupes.has(n))
      .map((n) => [n, triDansGroupe(groupes.get(n))]);
  }

  // Par pièce : l'ordre des pièces est celui du foyer, pas l'alphabet.
  for (const t of taches) pousser(t.room_id || '∅', t);
  const ordonnees = D.etat.pieces.filter((p) => groupes.has(p.id))
    .map((p) => [p.nom, triDansGroupe(groupes.get(p.id))]);
  if (groupes.has('∅')) ordonnees.push(['Sans pièce', triDansGroupe(groupes.get('∅'))]);
  // Une pièce supprimée alors que des tâches y pointaient encore.
  for (const [clef, liste] of groupes) {
    if (clef !== '∅' && !D.etat.pieces.some((p) => p.id === clef)) {
      ordonnees.push(['Pièce supprimée', triDansGroupe(liste)]);
    }
  }
  return ordonnees;
}

/** Dans un groupe : le retard d'abord, puis par échéance, les sans-date à la
    fin, et les terminées tout en bas. */
function triDansGroupe(liste) {
  const poids = (t) => (t.statut === 'fait' ? 3 : t.echeance ? (estEnRetard(t) ? 0 : 1) : 2);
  return liste.slice().sort((a, b) =>
    poids(a) - poids(b) ||
    (a.echeance || '9999').localeCompare(b.echeance || '9999') ||
    a.titre.localeCompare(b.titre, 'fr'));
}

/* ------------------------------------------------------------- Chantiers --
   La nature « artisan » uniquement, groupée par pièce, avec l'avancement et
   le couple estimé / réel. En tête, ce qui vous attend et ce qui est parti.  */

function ecranChantiers() {
  const ecran = h('div', { class: 'ecran' });
  ecran.appendChild(entete('Chantiers'));

  const chantiers = D.etat.taches.filter((t) => t.nature === 'artisan');
  const annee = new Date().getFullYear();

  const engage = chantiers
    .filter((t) => t.statut !== 'fait')
    .reduce((s, t) => s + Number(t.cout_estime || 0), 0);
  const depense = chantiers
    .filter((t) => t.statut === 'fait' && t.completed_at &&
                   new Date(t.completed_at).getFullYear() === annee)
    .reduce((s, t) => s + Number(t.cout_reel || 0), 0);

  ecran.appendChild(h('div', { class: 'entete__total' },
    h('div', { class: 'total' },
      h('span', { class: 'total__cle', texte: 'Engagé' }),
      h('span', { class: 'total__valeur', texte: montant(engage) }),
    ),
    h('div', { class: 'total' },
      h('span', { class: 'total__cle', texte: `Dépensé en ${annee}` }),
      h('span', { class: 'total__valeur', texte: montant(depense) }),
    ),
  ));
  ecran.appendChild(h('p', { class: 'total__note', texte:
    'Engagé : les estimations des chantiers non terminés. Dépensé : les coûts réels des chantiers achevés cette année.' }));

  if (!chantiers.length) {
    ecran.appendChild(etatVide(
      'Aucun chantier.',
      'Un chantier, c’est une tâche de nature « Artisan » : devis, planification, facture. Passez une tâche existante en Artisan depuis sa fiche, ou notez-en une nouvelle.',
      D.etat.taches.length
        ? h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Parcourir les tâches',
            onclick: () => allerA('tout') })
        : h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Noter un chantier',
            onclick: () => ouvrirAjout({ nature: 'artisan' }) }),
    ));
    return ecran;
  }

  const parPiece = new Map();
  for (const t of chantiers) {
    const clef = t.room_id || '∅';
    if (!parPiece.has(clef)) parPiece.set(clef, []);
    parPiece.get(clef).push(t);
  }

  const ordre = [
    ...D.etat.pieces.filter((p) => parPiece.has(p.id)).map((p) => [p.nom, parPiece.get(p.id)]),
    ...(parPiece.has('∅') ? [['Sans pièce', parPiece.get('∅')]] : []),
  ];

  for (const [titre, liste] of ordre) {
    const ul = h('ul', { class: 'liste' });
    for (const t of triDansGroupe(liste)) {
      const li = ligneTache(t, { montrerPiece: false, montantChantier: true });
      const meta = li.querySelector('.ligne__meta') ||
        li.querySelector('.ligne__corps').appendChild(h('div', { class: 'ligne__meta' }));
      // L'avancement en tête de la méta : c'est ce qu'on vient vérifier ici.
      const avancement = h('span', { class: 'ligne__avancement' },
        graduation(rangStatut(t.statut), 4),
        h('span', { texte: libelle(STATUTS, t.statut).toLowerCase() }),
      );
      meta.insertBefore(avancement, meta.firstChild);
      if (t.artisan_id) meta.appendChild(h('span', { texte: nomArtisan(t.artisan_id) || 'artisan supprimé' }));
      ul.appendChild(li);
    }
    ecran.appendChild(section(titre, liste.length, ul));
  }
  return ecran;
}

/* -------------------------------------------------------------- Artisans --
   Le carnet d'adresses. Groupé par métier : on cherche « un couvreur »
   avant de chercher « Maison Rouvier ». Appui sur le numéro = appel.        */

function ecranArtisans() {
  const ecran = h('div', { class: 'ecran' });
  ecran.appendChild(entete('Artisans',
    h('button', { class: 'bouton bouton--texte', type: 'button',
      onclick: () => ouvrirFicheArtisan(null) },
      icone('plus', 20), h('span', { texte: 'Ajouter' })),
  ));

  if (!D.etat.artisans.length) {
    ecran.appendChild(etatVide(
      'Le carnet est vide.',
      'Ajoutez le plombier venu l’hiver dernier, avec son numéro : vous n’aurez plus à fouiller vos SMS le jour où ça fuit.',
      h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Ajouter un artisan',
        onclick: () => ouvrirFicheArtisan(null) }),
    ));
    return ecran;
  }

  const parMetier = new Map();
  for (const a of D.etat.artisans) {
    const clef = (a.metier || '').trim() || '∅';
    if (!parMetier.has(clef)) parMetier.set(clef, []);
    parMetier.get(clef).push(a);
  }

  const metiers = [...parMetier.keys()].filter((m) => m !== '∅').sort((a, b) => a.localeCompare(b, 'fr'));
  if (parMetier.has('∅')) metiers.push('∅');

  for (const metier of metiers) {
    const liste = parMetier.get(metier).sort((a, b) =>
      Number(b.deja_utilise) - Number(a.deja_utilise) || a.nom.localeCompare(b.nom, 'fr'));
    const bloc = h('div', {});
    for (const a of liste) bloc.appendChild(ligneArtisan(a));
    ecran.appendChild(section(metier === '∅' ? 'Sans métier' : metier, liste.length, bloc));
  }
  return ecran;
}

function ligneArtisan(a) {
  const meta = h('div', { class: 'ligne__meta' });
  meta.appendChild(h('span', { texte: a.deja_utilise ? 'déjà venu' : 'jamais appelé' }));
  if (a.telephone) meta.appendChild(h('span', { texte: a.telephone }));

  const bloc = h('div', { class: 'artisan' },
    h('button', { class: 'artisan__ouvrir', type: 'button', onclick: () => ouvrirFicheArtisan(a.id) },
      h('div', { class: 'artisan__ligne' },
        h('span', { class: 'artisan__nom', texte: a.nom }),
        a.appreciation ? graduation(a.appreciation, 5, true) : null,
      ),
      meta,
    ),
  );

  if (a.telephone) {
    bloc.appendChild(h('a', {
      class: 'appel', href: 'tel:' + a.telephone.replace(/[^+0-9]/g, ''),
      'aria-label': `Appeler ${a.nom} au ${a.telephone}`,
    }, icone('telephone', 18), h('span', { texte: a.telephone }),
       h('span', { class: 'appel__quoi', texte: 'Appeler' })));
  }
  return bloc;
}

/* ================================================================ fiches == */

/** Le titre s'édite là où il s'affiche : un textarea qui grandit tout seul. */
function ajusterHauteur(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function bloc(...enfants) {
  return h('div', { class: 'fiche__bloc' }, ...enfants.filter(Boolean));
}

function champPuces(intitule, options, actuelle, onChoix, opts = {}) {
  const puces = h('div', { class: 'puces' + (opts.cibles ? ' puces--cibles' : '') });
  for (const [valeur, nom] of options) {
    puces.appendChild(h('button', {
      class: 'puce', type: 'button',
      'aria-pressed': valeur === actuelle ? 'true' : 'false',
      texte: nom,
      onclick: () => onChoix(valeur === actuelle && opts.deselectionnable ? null : valeur),
    }));
  }
  if (opts.enPlus) puces.appendChild(opts.enPlus);
  return h('div', { class: 'champ' },
    h('span', { class: 'champ__intitule', texte: intitule }), puces);
}

function champSaisie(intitule, valeur, onEnregistre, opts = {}) {
  const el = h(opts.multiligne ? 'textarea' : 'input', {
    class: 'saisie' + (opts.classe ? ' ' + opts.classe : ''),
    value: valeur ?? '',
    type: opts.type || 'text',
    inputmode: opts.inputmode,
    placeholder: opts.placeholder,
    step: opts.step,
    min: opts.min,
    rows: opts.multiligne ? 3 : null,
  });
  el.addEventListener('change', () => onEnregistre(el.value));
  el.addEventListener('blur', () => onEnregistre(el.value));
  return h('label', { class: 'champ' },
    h('span', { class: 'champ__intitule', texte: intitule }), el);
}

/* ---------------------------------------------------------- fiche tâche -- */

function ficheTache(id) {
  const t = D.etat.taches.find((x) => x.id === id);
  if (!t) {
    return h('div', { class: 'ecran' },
      enteteFiche('Tâche introuvable'),
      etatVide('Cette tâche n’existe plus.',
        'Elle a peut-être été supprimée depuis l’autre téléphone.',
        h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Revenir à la liste',
          onclick: fermerFiche })));
  }

  const enregistrer = (patch) => {
    D.modifierTache(id, patch).catch((e) => signaler(D.messageErreur(e)));
    Object.assign(t, patch);
  };

  const ecran = h('div', { class: 'ecran fiche' });
  ecran.appendChild(enteteFiche(nomPiece(t.room_id) || 'Sans pièce'));

  // Titre — édition en place, sauvegarde à la sortie du champ.
  const titre = h('textarea', { class: 'fiche__titre', rows: 1, value: t.titre,
    'aria-label': 'Titre de la tâche' });
  titre.addEventListener('input', () => ajusterHauteur(titre));
  titre.addEventListener('blur', () => {
    const v = titre.value.trim();
    if (!v) { titre.value = t.titre; return; }
    if (v !== t.titre) enregistrer({ titre: v });
  });
  ecran.appendChild(bloc(titre));

  // La coche, en grand, juste sous le titre : c'est l'action principale.
  const faite = t.statut === 'fait';
  ecran.appendChild(bloc(
    h('button', {
      class: 'bouton ' + (faite ? 'bouton--trait' : 'bouton--plein'),
      type: 'button',
      texte: faite ? 'Annuler — remettre à faire'
        : t.recurrence_mois != null ? 'C’est fait — reporter au prochain passage'
        : 'C’est fait',
      onclick: async () => {
        try {
          if (faite) await D.decocherTache(id);
          else {
            const r = await D.cocherTache(id);
            if (r && r.recurrente) signaler(`Prochain passage le ${dateCourte(r.echeance)}.`);
          }
          rendre();
        } catch (e) { signaler(D.messageErreur(e)); }
      },
    }),
  ));

  ecran.appendChild(bloc(
    champPuces('Pièce', D.etat.pieces.map((p) => [p.id, p.nom]), t.room_id,
      (v) => { enregistrer({ room_id: v }); rendre(); },
      { deselectionnable: true, enPlus: h('button', {
          class: 'puce puce--ajout', type: 'button', texte: '+ Nouvelle pièce',
          onclick: () => demanderPiece((piece) => { enregistrer({ room_id: piece.id }); rendre(); }),
        }) }),
    champPuces('Nature', NATURES, t.nature, (v) => { enregistrer({ nature: v }); rendre(); }),
    champPuces('Statut', STATUTS, t.statut, (v) => {
      const patch = { statut: v };
      if (v === 'fait' && !t.completed_at) patch.completed_at = new Date().toISOString();
      if (v !== 'fait') patch.completed_at = null;
      enregistrer(patch); rendre();
    }),
    champPuces('Priorité', PRIORITES, t.priorite, (v) => { enregistrer({ priorite: v }); rendre(); }),
  ));

  ecran.appendChild(bloc(
    champSaisie('Échéance', t.echeance, (v) => enregistrer({ echeance: v || null }), { type: 'date' }),
    champPuces('Récurrence', RECURRENCES.map(([m, nom]) => [m, nom]), t.recurrence_mois ?? null,
      (v) => { enregistrer({ recurrence_mois: v }); rendre(); }),
    t.recurrence_mois != null && !t.echeance
      ? h('p', { class: 'message message--info', texte:
          'Sans échéance, le prochain passage sera calculé à partir d’aujourd’hui la première fois que vous cocherez.' })
      : null,
  ));

  ecran.appendChild(bloc(
    h('div', { class: 'duo' },
      champSaisie('Coût estimé', t.cout_estime, (v) => enregistrer({ cout_estime: v === '' ? null : Number(v) }),
        { type: 'number', inputmode: 'decimal', step: '1', min: '0', placeholder: '€' }),
      champSaisie('Coût réel', t.cout_reel, (v) => enregistrer({ cout_reel: v === '' ? null : Number(v) }),
        { type: 'number', inputmode: 'decimal', step: '1', min: '0', placeholder: '€' }),
    ),
    D.etat.personnes.length
      ? champPuces('Assignée à',
          [['aucune', 'Personne'], ...D.etat.personnes.map((p) => [p, p])],
          t.assigne_a ?? 'aucune',
          (v) => { enregistrer({ assigne_a: v === 'aucune' ? null : v }); rendre(); })
      : null,
    choixArtisan(t, enregistrer),
  ));

  ecran.appendChild(bloc(
    champSaisie('Notes', t.notes, (v) => enregistrer({ notes: v.trim() || null }),
      { multiligne: true, placeholder: 'Référence du modèle, mesures, ce qu’a dit l’artisan…' }),
  ));

  // L'historique des passages : chargé à la demande, seulement s'il existe.
  const histo = h('div', { class: 'fiche__bloc', hidden: true });
  ecran.appendChild(histo);
  D.historique(id).then((lignes) => {
    if (!lignes.length) return;
    histo.hidden = false;
    histo.appendChild(h('span', { class: 'champ__intitule', texte: 'Faite ' + lignes.length + ' fois' }));
    const ul = h('ul', { class: 'historique' });
    for (const l of lignes) {
      ul.appendChild(h('li', {},
        h('span', { texte: new Date(l.fait_le).toLocaleDateString('fr-FR',
          { day: 'numeric', month: 'long', year: 'numeric' }) }),
        h('span', { class: 't-meta', texte:
          [l.fait_par, montant(l.cout_reel)].filter(Boolean).join(' · ') }),
      ));
    }
    histo.appendChild(ul);
  }).catch(() => { /* hors ligne : l'historique n'est pas vital */ });

  ecran.appendChild(bloc(zoneSuppression(
    'Supprimer cette tâche',
    'Supprimer définitivement',
    async () => { await D.supprimerTache(id); fermerFiche(); },
  )));

  return ecran;
}

function choixArtisan(t, enregistrer) {
  if (!D.etat.artisans.length) {
    if (t.nature !== 'artisan') return null;
    return h('div', { class: 'champ' },
      h('span', { class: 'champ__intitule', texte: 'Artisan' }),
      h('button', { class: 'bouton bouton--trait', type: 'button',
        texte: 'Le carnet est vide — ajouter un artisan',
        onclick: () => ouvrirFicheArtisan(null) }));
  }
  const select = h('select', { class: 'saisie' });
  select.appendChild(h('option', { value: '', texte: 'Aucun' }));
  for (const a of D.etat.artisans) {
    const o = h('option', { value: a.id, texte: a.nom + (a.metier ? ` — ${a.metier}` : '') });
    if (a.id === t.artisan_id) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => enregistrer({ artisan_id: select.value || null }));
  return h('label', { class: 'champ' },
    h('span', { class: 'champ__intitule', texte: 'Artisan' }), select);
}

/** Suppression en deux temps, sans modale : le bouton devient sa propre
    confirmation, et on peut toujours reculer. */
function zoneSuppression(intitule, confirmation, action) {
  const zone = h('div', { class: 'suppression' });
  const bouton = h('button', { class: 'bouton bouton--texte bouton--danger', type: 'button', texte: intitule });
  bouton.addEventListener('click', () => {
    zone.replaceChildren(
      h('p', { class: 'message', texte: 'Cette suppression est définitive.' }),
      h('div', { class: 'duo' },
        h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Annuler',
          onclick: () => { zone.replaceChildren(bouton); } }),
        h('button', { class: 'bouton bouton--plein bouton--rouge', type: 'button', texte: confirmation,
          onclick: () => action().catch((e) => signaler(D.messageErreur(e))) }),
      ),
    );
  });
  zone.appendChild(bouton);
  return zone;
}

/* -------------------------------------------------------- fiche artisan -- */

function ficheArtisan(id) {
  const nouveau = !id;
  const a = nouveau
    ? { nom: '', metier: '', telephone: '', email: '', notes: '', deja_utilise: false, appreciation: null }
    : D.etat.artisans.find((x) => x.id === id);

  if (!a) {
    return h('div', { class: 'ecran' }, enteteFiche('Artisan introuvable'),
      etatVide('Cette fiche n’existe plus.', 'Elle a peut-être été supprimée depuis l’autre téléphone.',
        h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Revenir au carnet', onclick: fermerFiche })));
  }

  const brouillon = { ...a };
  const enregistrer = (patch) => {
    Object.assign(brouillon, patch);
    if (nouveau) return;
    Object.assign(a, patch);
    D.modifierArtisan(id, patch).catch((e) => signaler(D.messageErreur(e)));
  };

  const ecran = h('div', { class: 'ecran fiche' });
  ecran.appendChild(enteteFiche(nouveau ? 'Nouvel artisan' : (a.metier || 'Artisan')));

  const nom = h('textarea', { class: 'fiche__titre', rows: 1, value: a.nom,
    placeholder: 'Nom de l’entreprise', 'aria-label': 'Nom de l’artisan' });
  nom.addEventListener('input', () => ajusterHauteur(nom));
  nom.addEventListener('blur', () => {
    const v = nom.value.trim();
    if (!v && !nouveau) { nom.value = a.nom; return; }
    if (v !== a.nom) enregistrer({ nom: v });
  });
  ecran.appendChild(bloc(nom));

  ecran.appendChild(bloc(
    champSaisie('Métier', a.metier, (v) => enregistrer({ metier: v.trim() || null }),
      { placeholder: 'Plombier, couvreur, électricien…' }),
    champSaisie('Téléphone', a.telephone, (v) => enregistrer({ telephone: v.trim() || null }),
      { type: 'tel', inputmode: 'tel', placeholder: '06 12 34 56 78' }),
    champSaisie('Courriel', a.email, (v) => enregistrer({ email: v.trim() || null }),
      { type: 'email', inputmode: 'email' }),
  ));

  ecran.appendChild(bloc(
    champPuces('Déjà venu ?', [[false, 'Jamais appelé'], [true, 'Déjà venu']], !!brouillon.deja_utilise,
      (v) => { enregistrer({ deja_utilise: v }); rendre(); }),
    h('div', { class: 'champ' },
      h('span', { class: 'champ__intitule' },
        h('span', { texte: 'Appréciation' }),
        brouillon.appreciation ? graduation(brouillon.appreciation, 5, true) : null),
      (() => {
        const puces = h('div', { class: 'puces puces--cibles' });
        for (const [v, nom] of [[null, 'Sans avis'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]) {
          puces.appendChild(h('button', {
            class: 'puce', type: 'button', texte: nom,
            'aria-pressed': v === (brouillon.appreciation ?? null) ? 'true' : 'false',
            'aria-label': v === null ? 'Sans avis' : `${v} sur 5`,
            onclick: () => { enregistrer({ appreciation: v }); rendre(); },
          }));
        }
        return puces;
      })()),
    champSaisie('Notes', a.notes, (v) => enregistrer({ notes: v.trim() || null }),
      { multiligne: true, placeholder: 'Ce qu’il a fait, ses délais, son sérieux…' }),
  ));

  if (nouveau) {
    ecran.appendChild(bloc(
      h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Ajouter au carnet',
        onclick: async () => {
          if (!nom.value.trim()) { nom.focus(); signaler('Donnez au moins un nom à cet artisan.'); return; }
          try {
            brouillon.nom = nom.value.trim();
            const cree = await D.ajouterArtisan(brouillon);
            vue.fiche = { type: 'artisan', id: cree.id };
            rendre();
            signaler(`${cree.nom} est dans le carnet.`);
          } catch (e) { signaler(D.messageErreur(e)); }
        } }),
    ));
    return ecran;
  }

  // Les chantiers déjà confiés : c'est l'information qu'on cherche quand on
  // rouvre la fiche d'un artisan deux ans plus tard.
  const chantiers = D.etat.taches.filter((t) => t.artisan_id === id);
  if (chantiers.length) {
    const ul = h('ul', { class: 'liste' });
    for (const t of triDansGroupe(chantiers)) ul.appendChild(ligneTache(t));
    ecran.appendChild(h('div', { class: 'fiche__bloc fiche__bloc--liste' },
      h('span', { class: 'champ__intitule', texte: `Chantiers confiés (${chantiers.length})` }), ul));
  }

  ecran.appendChild(bloc(zoneSuppression(
    'Retirer du carnet', 'Supprimer définitivement',
    async () => { await D.supprimerArtisan(id); fermerFiche(); },
  )));
  return ecran;
}

function enteteFiche(surtitre) {
  return h('header', { class: 'entete-fiche' },
    h('button', { class: 'retour', type: 'button', onclick: fermerFiche },
      icone('retour', 20), h('span', { texte: 'Retour' })),
    h('span', { class: 'entete-fiche__surtitre', texte: surtitre }),
  );
}

function ouvrirFicheTache(id) {
  vue.fiche = { type: 'tache', id };
  history.pushState({ fiche: true }, '');
  rendre();
  window.scrollTo(0, 0);
}

function ouvrirFicheArtisan(id) {
  vue.fiche = { type: 'artisan', id };
  history.pushState({ fiche: true }, '');
  rendre();
  window.scrollTo(0, 0);
}

function fermerFiche() {
  if (history.state && history.state.fiche) { history.back(); return; }
  vue.fiche = null;
  rendre();
}

/* ================================================================ volets == */

let voletOuvert = null;

function fermerVolet() {
  if (!voletOuvert) return;
  const { voile, volet, origine, rendreALaFermeture } = voletOuvert;
  voletOuvert = null;
  if (origine && origine.isConnected && typeof origine.focus === 'function') origine.focus();
  delete voile.dataset.ouvert;
  delete volet.dataset.ouvert;
  setTimeout(() => { voile.remove(); volet.remove(); }, 200);
  document.documentElement.style.setProperty('--clavier', '0px');
  if (rendreALaFermeture) rendre();
}

function ouvrirVolet(titre, contenu, options = {}) {
  const origine = document.activeElement;
  fermerVolet();
  const voile = h('div', { class: 'voile', onclick: fermerVolet });
  const volet = h('div', { class: 'volet', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
    h('div', { class: 'volet__tete' },
      h('h2', { class: 't-piece', texte: titre }),
      h('button', { class: 'volet__fermer', type: 'button', 'aria-label': 'Fermer',
        icone: 'croix', onclick: fermerVolet }),
    ),
    contenu,
  );
  document.body.append(voile, volet);
  voletOuvert = { voile, volet, origine, rendreALaFermeture: options.rendreALaFermeture };
  requestAnimationFrame(() => { voile.dataset.ouvert = ''; volet.dataset.ouvert = ''; });
  if (options.focus) requestAnimationFrame(() => options.focus());
  return volet;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (voletOuvert) fermerVolet(); else if (vue.fiche) fermerFiche(); }
});

/* ------------------------------------------------------------ ajout rapide --
   Titre, pièce, c'est tout. Le reste se complète plus tard dans la fiche. */

function ouvrirAjout(prefill = {}) {
  let piece = prefill.room_id ?? vue.dernierePiece ?? null;

  const titre = h('input', {
    class: 'saisie saisie--titre', type: 'text', enterkeyhint: 'done',
    placeholder: 'Changer le joint d’évier…', 'aria-label': 'Titre de la tâche',
    autocapitalize: 'sentences', autocomplete: 'off',
  });

  const puces = h('div', { class: 'puces puces--defilantes puces--cibles' });
  const peindrePuces = () => {
    puces.replaceChildren();
    for (const p of D.etat.pieces) {
      puces.appendChild(h('button', {
        class: 'puce', type: 'button', texte: p.nom,
        'aria-pressed': p.id === piece ? 'true' : 'false',
        onclick: () => { piece = p.id === piece ? null : p.id; peindrePuces(); },
      }));
    }
    puces.appendChild(h('button', {
      class: 'puce puce--ajout', type: 'button', texte: '+ Nouvelle pièce',
      onclick: () => demanderPiece((p) => { piece = p.id; peindrePuces(); }),
    }));
    const active = puces.querySelector('[aria-pressed="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  peindrePuces();

  const valider = async () => {
    const v = titre.value.trim();
    if (!v) { titre.focus(); return; }
    try {
      const tache = await D.ajouterTache({ titre: v, room_id: piece, ...prefill });
      vue.dernierePiece = piece;
      fermerVolet();
      rendre();
      const ou = nomPiece(piece);
      signaler(ou ? `Ajouté dans ${ou}.` : 'Ajouté.', {
        texte: 'Ouvrir', action: () => ouvrirFicheTache(tache.id),
      });
    } catch (e) { signaler(D.messageErreur(e)); }
  };

  titre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } });

  ouvrirVolet('Écrire sur l’ardoise',
    h('div', {},
      titre,
      h('div', { class: 'champ', style: 'margin-top:12px' },
        h('span', { class: 'champ__intitule', texte: 'Dans quelle pièce ?' }), puces),
      h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Ajouter', onclick: valider }),
      h('p', { class: 't-meta', style: 'margin:12px 0 0', texte:
        'Le coût, l’échéance et l’artisan se complètent plus tard, dans la fiche.' }),
    ),
    { focus: () => titre.focus() },
  );
}

function demanderPiece(ensuite) {
  const champ = h('input', { class: 'saisie', type: 'text', placeholder: 'Véranda, appentis, chaufferie…',
    'aria-label': 'Nom de la pièce', enterkeyhint: 'done', autocapitalize: 'words' });
  const valider = async () => {
    const v = champ.value.trim();
    if (!v) { champ.focus(); return; }
    try {
      const piece = await D.ajouterPiece(v);
      fermerVolet();
      ensuite(piece);
    } catch (e) { signaler(D.messageErreur(e)); }
  };
  champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } });

  // On empile volontairement : c'est le seul cas, il est court, et revenir
  // en arrière depuis un formulaire d'ajout serait pire.
  const precedent = voletOuvert;
  if (precedent) { precedent.voile.remove(); precedent.volet.remove(); voletOuvert = null; }
  ouvrirVolet('Nouvelle pièce',
    h('div', {}, champ,
      h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Créer la pièce', onclick: valider,
        style: 'margin-top:12px' })),
    { focus: () => champ.focus() });
}

/* ------------------------------------------------------------- filtres -- */

function ouvrirFiltres() {
  const f = vue.filtres;
  const corps = h('div', {});
  const repeindre = () => {
    corps.replaceChildren(
      champPuces('Pièce', D.etat.pieces.map((p) => [p.id, p.nom]), f.piece,
        (v) => { f.piece = v; repeindre(); }, { deselectionnable: true, cibles: true }),
      champPuces('Nature', NATURES, f.nature, (v) => { f.nature = v; repeindre(); },
        { deselectionnable: true, cibles: true }),
      champPuces('Statut', STATUTS, f.statut, (v) => { f.statut = v; repeindre(); },
        { deselectionnable: true, cibles: true }),
      D.etat.personnes.length
        ? champPuces('Personne',
            [['aucune', 'Non assignées'], ...D.etat.personnes.map((p) => [p, p])],
            f.personne, (v) => { f.personne = v; repeindre(); }, { deselectionnable: true, cibles: true })
        : null,
      champPuces('Grouper par',
        [['piece', 'Pièce'], ['echeance', 'Échéance'], ['nature', 'Nature']],
        vue.groupement, (v) => { vue.groupement = v || 'piece'; repeindre(); }, { cibles: true }),
      h('div', { class: 'duo' },
        h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Tout effacer',
          onclick: () => {
            vue.filtres = { piece: null, nature: null, statut: null, personne: null, terminees: false };
            vue.groupement = 'piece';
            fermerVolet();
          } }),
        h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Voir le résultat',
          onclick: fermerVolet }),
      ),
    );
  };
  repeindre();
  ouvrirVolet('Filtrer', corps, { rendreALaFermeture: true });
}

/* ------------------------------------------------------------- réglages -- */

function ouvrirReglages() {
  const theme = localStorage.getItem('ardoise-theme') || 'auto';
  const corps = h('div', {});

  corps.appendChild(champPuces('Apparence',
    [['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']], theme,
    (v) => {
      localStorage.setItem('ardoise-theme', v);
      appliquerTheme();
      fermerVolet();
      ouvrirReglages();
    }, { cibles: true }));

  // Les personnes du foyer : de simples prénoms, séparés par des virgules.
  // Il n'y a pas de comptes dans Ardoise, donc pas de liste à administrer —
  // juste de quoi savoir qui s'est engagé à faire quoi.
  const champPersonnes = h('input', { class: 'saisie', type: 'text',
    value: D.etat.personnes.join(', '), placeholder: 'Pauline, Julien',
    'aria-label': 'Prénoms des personnes du foyer', autocapitalize: 'words' });
  champPersonnes.addEventListener('change', async () => {
    try { await D.definirPersonnes(champPersonnes.value.split(',')); }
    catch (e) { signaler(D.messageErreur(e)); }
  });
  corps.appendChild(h('div', { class: 'reglage' },
    h('span', { class: 'champ__intitule', texte: 'Personnes' }),
    h('p', { class: 't-meta', texte:
      'Les prénoms proposés au moment d\u2019assigner une tâche. Séparez-les par des virgules.' }),
    champPersonnes,
  ));

  corps.appendChild(h('div', { class: 'reglage' },
    h('span', { class: 'champ__intitule', texte: 'Pièces' }),
    h('p', { class: 't-meta', texte:
      'Renommer une pièce la renomme partout. La supprimer laisse ses tâches dans « Sans pièce ».' }),
    listePiecesReglables(),
  ));

  corps.appendChild(blocSauvegarde());

  corps.appendChild(h('div', { class: 'reglage' },
    zoneSuppression('Effacer toutes les données', 'Tout effacer définitivement', async () => {
      await D.toutEffacer();
      fermerVolet();
      vue.fiche = null;
      rendre();
      signaler('Ardoise est repartie de zéro.');
    }),
  ));

  ouvrirVolet('Réglages', corps, { rendreALaFermeture: true });
}

/** Sans serveur, l'export est la seule sauvegarde — et le seul moyen de
    passer sa liste à l'autre téléphone. On le dit franchement plutôt que
    de laisser croire à une synchronisation qui n'existe pas. */
function blocSauvegarde() {
  const nbTaches = D.etat.taches.length;

  const fichier = h('input', { type: 'file', accept: 'application/json,.json',
    class: 'invisible', 'aria-hidden': 'true', tabindex: '-1' });

  fichier.addEventListener('change', async () => {
    const f = fichier.files && fichier.files[0];
    fichier.value = '';
    if (!f) return;
    try {
      const texte = await f.text();
      const combien = await D.importer(texte);
      fermerVolet();
      vue.fiche = null;
      rendre();
      signaler(`${combien} tâche${combien > 1 ? 's' : ''} restaurée${combien > 1 ? 's' : ''}.`);
    } catch (e) { signaler(D.messageErreur(e)); }
  });

  const zoneImport = h('div', {});
  const boutonImport = h('button', { class: 'bouton bouton--trait', type: 'button',
    texte: 'Restaurer une sauvegarde' });
  boutonImport.addEventListener('click', () => {
    zoneImport.replaceChildren(
      h('p', { class: 'message', texte:
        'Restaurer remplace tout ce qui est actuellement sur ce téléphone. Exportez d\u2019abord si vous avez un doute.' }),
      h('div', { class: 'duo' },
        h('button', { class: 'bouton bouton--trait', type: 'button', texte: 'Annuler',
          onclick: () => zoneImport.replaceChildren(boutonImport) }),
        h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Choisir le fichier',
          onclick: () => fichier.click() }),
      ),
    );
  });
  zoneImport.appendChild(boutonImport);

  return h('div', { class: 'reglage' },
    h('span', { class: 'champ__intitule', texte: 'Sauvegarde' }),
    h('p', { class: 't-meta', texte:
      'Vos données ne vivent que sur ce téléphone : aucun serveur ne les détient, donc personne ne peut vous les rendre si elles disparaissent. L\u2019export est votre filet — et c\u2019est aussi ainsi qu\u2019on passe sa liste à l\u2019autre téléphone.' }),
    h('button', { class: 'bouton bouton--plein', type: 'button',
      texte: `Exporter ${nbTaches} tâche${nbTaches > 1 ? 's' : ''}`,
      disabled: !nbTaches && !D.etat.artisans.length,
      onclick: async () => {
        try {
          const issue = await D.exporter();
          if (issue === 'telecharge') signaler('Sauvegarde téléchargée.');
          else if (issue === 'partage') signaler('Sauvegarde envoyée.');
        } catch (e) { signaler(D.messageErreur(e)); }
      } }),
    zoneImport,
    fichier,
  );
}

function listePiecesReglables() {
  const bloc = h('div', { class: 'pieces-reglage' });
  const peindre = () => {
    bloc.replaceChildren();
    for (const p of D.etat.pieces) {
      const compte = D.etat.taches.filter((t) => t.room_id === p.id).length;
      const champ = h('input', { class: 'saisie saisie--ligne', type: 'text', value: p.nom,
        'aria-label': `Nom de la pièce ${p.nom}` });
      champ.addEventListener('blur', () => {
        const v = champ.value.trim();
        if (!v) { champ.value = p.nom; return; }
        if (v !== p.nom) D.renommerPiece(p.id, v).catch((e) => signaler(D.messageErreur(e)));
      });
      bloc.appendChild(h('div', { class: 'piece-rangee' }, champ,
        h('span', { class: 't-meta', texte: compte ? `${compte}` : '—',
          title: compte ? `${compte} tâche${compte > 1 ? 's' : ''}` : 'aucune tâche',
          'aria-label': compte ? `${compte} tâche${compte > 1 ? 's' : ''}` : 'aucune tâche' }),
        h('button', { class: 'bouton bouton--texte bouton--danger', type: 'button', texte: 'Supprimer',
          onclick: async () => {
            try { await D.supprimerPiece(p.id); peindre(); } catch (e) { signaler(D.messageErreur(e)); }
          } }),
      ));
    }
    bloc.appendChild(h('button', { class: 'puce puce--ajout', type: 'button', texte: '+ Nouvelle pièce',
      onclick: () => demanderPiece(() => { fermerVolet(); ouvrirReglages(); }) }));
  };
  peindre();
  return bloc;
}

/* ============================================================== messages == */

let minuterieMessage = null;

/** Un mot en bas de l'écran : ce qui vient d'être fait, ou ce qui a raté et
    quoi faire ensuite. Jamais d'alerte système. */
function signaler(texte, action = null) {
  clearTimeout(minuterieMessage);
  const existant = document.querySelector('.mot');
  if (existant) existant.remove();
  const mot = h('div', { class: 'mot', role: 'status' }, h('span', { texte }));
  if (action) {
    mot.appendChild(h('button', { class: 'mot__action', type: 'button', texte: action.texte,
      onclick: () => { mot.remove(); action.action(); } }));
  }
  document.body.appendChild(mot);
  requestAnimationFrame(() => { mot.dataset.ouvert = ''; });
  minuterieMessage = setTimeout(() => {
    delete mot.dataset.ouvert;
    setTimeout(() => mot.remove(), 220);
  }, action ? 6000 : 4000);
}

/** La marque : l'ardoise et son trait de craie, le même dessin que l'icône. */
function marque() {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.style.display = 'inline-flex';
  span.innerHTML =
    '<svg width="44" height="44" viewBox="0 0 512 512">' +
    '<rect width="512" height="512" rx="112" fill="var(--volet)"/>' +
    '<path fill="var(--platre)" d="M125.5 251.3 L202.4 322 L388.5 141.3 ' +
    'A10 10 0 0 1 403.5 154.7 L217.2 389.9 L98.5 280.7 A20 20 0 0 1 125.5 251.3 Z"/></svg>';
  return span;
}

/* ================================================================ coque == */

function barreEcriture() {
  return h('button', { class: 'ecriture', type: 'button', onclick: () => ouvrirAjout() },
    icone('craie', 20),
    h('span', { texte: 'Écrire sur l’ardoise…' }),
  );
}

function barreOnglets() {
  const nav = h('nav', { class: 'onglets', 'aria-label': 'Navigation principale' });
  const aujourdhui = isoDuJour();
  const retards = D.etat.taches.filter(
    (t) => t.statut !== 'fait' && t.echeance && t.echeance < aujourdhui).length;

  for (const [clef, nom, ico] of ONGLETS) {
    const actif = vue.onglet === clef;
    const bouton = h('button', {
      class: 'onglet', type: 'button',
      'aria-current': actif ? 'page' : null,
      onclick: () => allerA(clef),
    }, icone(ico, 21), h('span', { class: 'onglet__nom', texte: nom }));

    if (clef === 'semaine' && retards) {
      bouton.appendChild(h('span', { class: 'onglet__retard',
        texte: retards > 99 ? '99+' : String(retards),
        'aria-label': `${retards} en retard` }));
    }
    nav.appendChild(bouton);
  }
  return nav;
}

function allerA(onglet) {
  vue.onglet = onglet;
  vue.fiche = null;
  rendre();
  window.scrollTo(0, 0);
}

/* ================================================================ rendu == */

function appliquerTheme() {
  const choix = localStorage.getItem('ardoise-theme') || 'auto';
  if (choix === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choix);
}

const ECRANS = {
  semaine: ecranSemaine, tout: ecranTout,
  chantiers: ecranChantiers, artisans: ecranArtisans,
};

function rendre() {
  appliquerTheme();

  if (D.etat.phase !== 'prete') {
    document.body.classList.add('sans-chrome');
    racine.replaceChildren(D.etat.phase === 'panne' ? ecranPanne() : ecranDemarrage());
    return;
  }

  if (vue.fiche) {
    document.body.classList.add('sans-chrome');
    racine.replaceChildren(vue.fiche.type === 'tache'
      ? ficheTache(vue.fiche.id) : ficheArtisan(vue.fiche.id));
    for (const t of racine.querySelectorAll('textarea.fiche__titre')) ajusterHauteur(t);
    return;
  }

  document.body.classList.remove('sans-chrome');
  racine.replaceChildren((ECRANS[vue.onglet] || ecranSemaine)(), barreEcriture(), barreOnglets());
}

/** Le temps d'ouvrir la base : quelques dizaines de millisecondes en
    pratique. On montre la marque plutôt qu'un écran blanc. */
function ecranDemarrage() {
  return h('div', { class: 'connexion' },
    h('div', { class: 'connexion__marque' }, marque(),
      h('span', { class: 'connexion__nom', texte: 'Ardoise' })));
}

function ecranPanne() {
  return h('div', { class: 'connexion' },
    h('div', { class: 'connexion__marque' }, marque(),
      h('span', { class: 'connexion__nom', texte: 'Ardoise' })),
    h('p', { class: 'message', texte: D.etat.erreur || 'Le stockage est inaccessible.' }),
    h('p', { class: 'connexion__intro', texte:
      'Ardoise range tout dans le stockage privé de Safari. En navigation privée, il est bloqué — ouvrez l\u2019app depuis l\u2019écran d\u2019accueil, ou dans un onglet normal.' }),
    h('button', { class: 'bouton bouton--plein', type: 'button', texte: 'Réessayer',
      onclick: () => location.reload() }),
  );
}

/* ============================================================ démarrage == */

let redessinerAuBlur = false;

D.surChangement((detail) => {
  const saisieEnCours = document.activeElement &&
    /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

  // On ne redessine pas sous les doigts de quelqu'un qui est en train
  // d'écrire : le changement attendra la sortie du champ.
  if (saisieEnCours) { redessinerAuBlur = true; return; }
  rendre();
});

document.addEventListener('focusout', () => {
  if (!redessinerAuBlur) return;
  setTimeout(() => {
    if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    redessinerAuBlur = false;
    rendre();
  }, 120);
});

window.addEventListener('popstate', () => {
  if (vue.fiche) { vue.fiche = null; rendre(); }
});

// Le clavier iOS ne redimensionne pas la fenêtre : il faut lire le viewport
// visuel pour garder le panneau d'écriture juste au-dessus des touches.
if (window.visualViewport) {
  const suivre = () => {
    const vv = window.visualViewport;
    const clavier = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--clavier', (voletOuvert ? clavier : 0) + 'px');
  };
  window.visualViewport.addEventListener('resize', suivre);
  window.visualViewport.addEventListener('scroll', suivre);
}

appliquerTheme();
rendre();
D.demarrer();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Chemin relatif : sur GitHub Pages l'app vit dans un sous-dossier, et
    // un '/sw.js' absolu pointerait à la racine du domaine.
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .catch((e) => console.warn('[ardoise] service worker non enregistré', e));
  });

  // Une nouvelle version s'installe : on le dit, on ne recharge pas sous les
  // doigts de quelqu'un en train d'écrire.
  let versionInitiale = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (versionInitiale && !navigator.serviceWorker.controller) { versionInitiale = false; return; }
    signaler('Une nouvelle version d\u2019Ardoise est prête.',
      { texte: 'Recharger', action: () => location.reload() });
  });
}
