// ============================================================================
//  Modèle de configuration — copiez ce fichier en config.js et remplissez-le.
//
//  Ces deux valeurs sont PUBLIQUES par conception. L'URL du projet et la clef
//  « anon » sont faites pour être servies au navigateur : elles n'ouvrent
//  aucun accès par elles-mêmes. Ce qui protège vos données, c'est la Row
//  Level Security définie dans schema.sql, et rien d'autre.
//
//  En revanche la clef « service_role » ne doit JAMAIS apparaître ici, ni
//  nulle part ailleurs dans ce dépôt : celle-là contourne la RLS.
//
//  Où les trouver : Supabase ▸ votre projet ▸ Project Settings ▸ API Keys.
// ============================================================================

export const SUPABASE_URL = 'https://VOTRE-PROJET.supabase.co';
export const SUPABASE_ANON_KEY = 'collez-ici-la-clef-anon-publishable';
