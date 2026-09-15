/* Jeu d'essai : un foyer plausible, avec du retard, du récurrent, des
   chantiers chiffrés et un carnet d'artisans. Sert au banc d'essai
   Playwright, jamais à l'app. */
const jour = (n) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const FOYER = { id: 'f0000000-0000-4000-8000-000000000001', nom: 'La Bergerie' };
export const MOI = 'u0000000-0000-4000-8000-00000000000a';
export const AUTRE = 'u0000000-0000-4000-8000-00000000000b';

export const MEMBRES = [
  { user_id: MOI, prenom: 'Pauline' },
  { user_id: AUTRE, prenom: 'Julien' },
];

const p = (n) => `p0000000-0000-4000-8000-00000000000${n}`;
export const PIECES = [
  { id: p(1), nom: 'Cuisine', position: 10 },
  { id: p(2), nom: 'Salon', position: 20 },
  { id: p(3), nom: 'Salle de bain', position: 30 },
  { id: p(4), nom: 'Chambre', position: 40 },
  { id: p(5), nom: 'Combles', position: 50 },
  { id: p(6), nom: 'Toiture', position: 60 },
  { id: p(7), nom: 'Jardin', position: 70 },
  { id: p(8), nom: 'Chauffage', position: 80 },
];

const a = (n) => `a0000000-0000-4000-8000-00000000000${n}`;
export const ARTISANS = [
  { id: a(1), nom: 'Couverture Rouvier', metier: 'Couvreur', telephone: '06 12 34 56 78',
    email: 'contact@rouvier.fr', notes: 'Venu en mars pour la gouttière. Ponctuel, devis clair.',
    deja_utilise: true, appreciation: 4 },
  { id: a(2), nom: 'Bertrand & Fils', metier: 'Plombier', telephone: '04 78 21 09 44',
    email: null, notes: 'Recommandé par les voisins. Jamais appelé.', deja_utilise: false, appreciation: null },
  { id: a(3), nom: 'Élec Vallée', metier: 'Électricien', telephone: '07 61 88 02 13',
    email: 'devis@elecvallee.fr', notes: 'Tableau refait en 2024.', deja_utilise: true, appreciation: 5 },
  { id: a(4), nom: 'Atelier Faure', metier: 'Menuisier', telephone: '06 44 77 10 25',
    email: null, notes: null, deja_utilise: false, appreciation: 3 },
];

const t = (n) => `t0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
export const TACHES = [
  { id: t(1), titre: 'Ramoner le poêle à bois', room_id: p(2), nature: 'entretien',
    statut: 'a_faire', priorite: 'haute', echeance: jour(-38), recurrence_mois: 12,
    cout_estime: 90, cout_reel: null, assigne_a: AUTRE, artisan_id: null, notes: null },
  { id: t(2), titre: 'Rappeler le couvreur pour la gouttière nord', room_id: p(6),
    nature: 'artisan', statut: 'devis', priorite: 'normale', echeance: jour(-4),
    recurrence_mois: null, cout_estime: 1200, cout_reel: null, assigne_a: null,
    artisan_id: a(1), notes: 'Elle déborde dès qu’il pleut fort.' },
  { id: t(3), titre: 'Changer le joint du mitigeur', room_id: p(1), nature: 'bricolage',
    statut: 'a_faire', priorite: 'normale', echeance: jour(0), recurrence_mois: null,
    cout_estime: 8, cout_reel: null, assigne_a: MOI, artisan_id: null, notes: null },
  { id: t(4), titre: 'Détartrer la bouilloire', room_id: p(1), nature: 'entretien',
    statut: 'a_faire', priorite: 'basse', echeance: jour(2), recurrence_mois: 3,
    cout_estime: null, cout_reel: null, assigne_a: null, artisan_id: null, notes: null },
  { id: t(5), titre: 'Purger les radiateurs', room_id: p(8), nature: 'entretien',
    statut: 'a_faire', priorite: 'normale', echeance: jour(3), recurrence_mois: 12,
    cout_estime: null, cout_reel: null, assigne_a: AUTRE, artisan_id: null, notes: null },
  { id: t(6), titre: 'Poser les étagères de l’entrée', room_id: p(2), nature: 'bricolage',
    statut: 'a_faire', priorite: 'normale', echeance: jour(5), recurrence_mois: null,
    cout_estime: 60, cout_reel: null, assigne_a: MOI, artisan_id: null, notes: null },
  { id: t(7), titre: 'Isolation des combles', room_id: p(5), nature: 'artisan',
    statut: 'planifie', priorite: 'haute', echeance: jour(21), recurrence_mois: null,
    cout_estime: 4800, cout_reel: null, assigne_a: null, artisan_id: a(4),
    notes: 'Deux devis reçus, on part sur la laine de bois.' },
  { id: t(8), titre: 'Remplacer le tableau électrique du garage', room_id: p(5),
    nature: 'artisan', statut: 'a_faire', priorite: 'normale', echeance: null,
    recurrence_mois: null, cout_estime: 2300, cout_reel: null, assigne_a: null,
    artisan_id: a(3), notes: null },
  { id: t(9), titre: 'Refaire les joints de la douche', room_id: p(3), nature: 'bricolage',
    statut: 'a_faire', priorite: 'normale', echeance: null, recurrence_mois: null,
    cout_estime: 25, cout_reel: null, assigne_a: null, artisan_id: null, notes: null },
  { id: t(10), titre: 'Tailler la haie', room_id: p(7), nature: 'entretien',
    statut: 'a_faire', priorite: 'basse', echeance: jour(45), recurrence_mois: 6,
    cout_estime: null, cout_reel: null, assigne_a: MOI, artisan_id: null, notes: null },
  { id: t(11), titre: 'Réfection de la salle de bain', room_id: p(3), nature: 'artisan',
    statut: 'fait', priorite: 'normale', echeance: jour(-120), recurrence_mois: null,
    cout_estime: 6500, cout_reel: 7150, assigne_a: null, artisan_id: a(2),
    notes: null, completed_at: new Date(Date.now() - 120 * 864e5).toISOString() },
  { id: t(12), titre: 'Vérifier le détecteur de fumée', room_id: p(4), nature: 'entretien',
    statut: 'a_faire', priorite: 'normale', echeance: jour(-11), recurrence_mois: 12,
    cout_estime: null, cout_reel: null, assigne_a: null, artisan_id: null, notes: null },
].map((x) => ({
  household_id: FOYER.id, notes: null, cout_reel: null, completed_at: null,
  created_by: MOI, created_at: new Date().toISOString(), ...x,
}));
