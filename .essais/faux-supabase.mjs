/* Faux client Supabase, servi à la place du module CDN pendant les essais.
   Renvoie le TEXTE d'un module ES : Playwright le sert en réponse à la
   requête vers cdn.jsdelivr.net, et l'app l'importe sans savoir. */
import * as J from './jeu-dessai.mjs';

export const CONFIG_ESSAI =
  "export const SUPABASE_URL = 'https://essai-ardoise.supabase.co';\n" +
  "export const SUPABASE_ANON_KEY = 'cle-anon-de-banc-d-essai-uniquement-aaaaaaaaaaaa';\n";

export function moduleFactice() {
  const donnees = {
    rooms: J.PIECES, tasks: J.TACHES, artisans: J.ARTISANS,
    household_members: J.MEMBRES, task_completions: [],
  };
  const membre = { user_id: J.MOI, prenom: 'Pauline', household_id: J.FOYER.id, households: J.FOYER };

  return `
const DONNEES = ${JSON.stringify(donnees)};
const MEMBRE = ${JSON.stringify(membre)};
globalThis.__ardoiseEssai = { appels: [], donnees: DONNEES };

function constructeur(table) {
  const b = {
    _single: false,
    select() { return b; }, eq() { return b; }, order() { return b; }, limit() { return b; },
    maybeSingle() { b._single = true; return b; }, single() { b._single = true; return b; },
    insert(l) { globalThis.__ardoiseEssai.appels.push(['insert', table, l]);
      DONNEES[table] = [...(DONNEES[table] || []), l];
      return Promise.resolve({ data: [l], error: null }); },
    update(p) { globalThis.__ardoiseEssai.appels.push(['update', table, p]);
      return { eq: () => Promise.resolve({ data: null, error: null }) }; },
    delete() { globalThis.__ardoiseEssai.appels.push(['delete', table]);
      return { eq: () => Promise.resolve({ data: null, error: null }) }; },
    then(res, rej) {
      const data = (table === 'household_members' && b._single) ? MEMBRE : (DONNEES[table] || []);
      return Promise.resolve({ data, error: null }).then(res, rej);
    },
  };
  return b;
}

export function createClient() {
  const session = { access_token: 'essai',
    user: { id: ${JSON.stringify(J.MOI)}, email: 'pauline@exemple.fr' } };
  try { localStorage.setItem('ardoise-auth', JSON.stringify(session)); } catch (e) {}
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async () => ({ data: { session }, error: null }),
      signOut: async () => ({ error: null }),
    },
    realtime: { setAuth() {} },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    removeChannel() {},
    from: constructeur,
    rpc: async (fn, args) => {
      globalThis.__ardoiseEssai.appels.push(['rpc', fn, args]);
      return { data: null, error: null };
    },
  };
}
`;
}

/** Branche les deux interceptions sur une page OU un contexte Playwright.
    Sur un contexte, les requêtes du service worker passent aussi par là. */
export async function brancher(page) {
  await page.route('**cdn.jsdelivr.net/**', (r) =>
    r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: moduleFactice() }));
}
