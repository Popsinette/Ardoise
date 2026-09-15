# Ardoise

Les travaux de la maison sur les deux téléphones : le petit bricolage,
l'entretien récurrent et les gros chantiers avec artisans et budget.

Application web statique, sans étape de compilation. On pousse sur `main`,
GitHub Pages sert le dossier racine, et c'est en ligne. Pas de npm, pas de
bundler, pas d'Actions.

- **Frontend** — HTML/CSS/JS en modules ES, servi par GitHub Pages
- **Backend** — Supabase : Postgres, Auth, Realtime (offre gratuite)
- **Coût** — zéro, dans les offres gratuites permanentes des deux services

---

## Mise en ligne, pas à pas

Comptez vingt minutes. Chaque étape est indispensable ; aucune n'est
devinable, donc elles sont toutes écrites.

### 1. Créer le projet Supabase

Sur [supabase.com](https://supabase.com), créez un compte puis un nouveau
projet. Choisissez la région **Europe (Frankfurt ou Paris)** : c'est la
latence de chaque coche de case.

Notez le mot de passe de la base que Supabase vous demande de choisir — il ne
sert pas à l'app, mais il est impossible à récupérer ensuite.

### 2. Exécuter le schéma

Dans le projet : **SQL Editor** ▸ **New query**. Collez tout le contenu de
[`schema.sql`](schema.sql) et cliquez sur **Run**.

Le script crée les six tables, active la Row Level Security sur chacune,
installe les deux fonctions métier, branche le temps réel et crée votre
foyer avec une vingtaine de pièces.

Une seule chose à personnaliser, tout en bas du fichier :

```sql
v_nom_foyer text := 'Maison';   -- ← mettez le nom que vous voulez
```

Le script est rejouable : si vous le relancez, rien n'est dupliqué.

### 3. Activer la connexion par email

**Authentication** ▸ **Sign In / Providers** ▸ **Email** : vérifiez que le
fournisseur est activé.

### 4. Mettre le code à six chiffres dans les emails ⚠️

**C'est l'étape qu'on oublie, et sans elle rien ne marche.**

Par défaut, Supabase envoie un *lien* à cliquer. Or sur iPhone, un lien
ouvre Safari et non la PWA : la session atterrit du mauvais côté et l'app
reste déconnectée. Ardoise demande donc un **code à six chiffres**, qui se
tape à l'intérieur de l'app — mais encore faut-il que l'email le contienne.

Allez dans **Authentication** ▸ **Emails** (ou *Email Templates*) et modifiez
**les deux** modèles suivants :

| Modèle | Quand il sert |
|---|---|
| **Magic Link** | à chaque connexion d'un compte déjà créé |
| **Confirm signup** | à la toute première connexion d'un compte |

Dans chacun, remplacez le corps par quelque chose comme :

```html
<h2>Votre code Ardoise</h2>
<p>Saisissez ce code dans l'application :</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>Il reste valable une heure.</p>
```

Le jeton indispensable est `{{ .Token }}`. Si vous laissez
`{{ .ConfirmationURL }}`, vous recevrez un lien et la connexion échouera.

> **Le quota d'emails.** Le serveur d'envoi intégré à Supabase est bridé à
> quelques messages par heure — c'est un service de test, pas de production.
> Pour deux personnes qui se connectent une fois par téléphone, c'est
> largement suffisant. Si vous tombez sur « rate limit », attendez une
> heure, ou configurez un SMTP à vous dans **Authentication** ▸ **SMTP
> Settings** (Brevo, Resend et Mailjet ont des offres gratuites).

### 5. Déclarer l'adresse de l'app

**Authentication** ▸ **URL Configuration** :

- **Site URL** : `https://popsinette.github.io/Ardoise/`
- **Redirect URLs** : ajoutez la même adresse.

Ardoise n'utilise pas de lien de redirection, donc rien n'en dépend au
quotidien. Mais si un lien est cliqué un jour — un email de réinitialisation,
par exemple — sans cette déclaration il mènera dans le vide.

### 6. Remplir `config.js`

**Project Settings** ▸ **API** (ou *API Keys*). Récupérez :

- **Project URL** — de la forme `https://abcdefgh.supabase.co`
- **anon / public** (parfois nommée *publishable*) — la longue clef

Ouvrez [`config.js`](config.js) à la racine du dépôt et remplacez les deux
valeurs :

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6…';
```

Poussez sur `main`.

> **Ces deux valeurs sont publiques par conception**, et les laisser en clair
> dans un dépôt public est la manière prévue de faire. Elles n'ouvrent rien
> par elles-mêmes : ce sont les règles RLS de `schema.sql` qui protègent vos
> données. En revanche la clef **`service_role`** contourne la RLS — elle ne
> doit jamais apparaître ici, ni dans un commentaire, ni dans un commit
> ancien, ni nulle part dans ce dépôt.

### 7. Activer GitHub Pages

Dans le dépôt : **Settings** ▸ **Pages**.

- **Source** : *Deploy from a branch*
- **Branch** : `main`, dossier `/ (root)`

Une minute plus tard, l'app répond sur
`https://popsinette.github.io/Ardoise/`. Attention à la majuscule : le
chemin d'une page GitHub respecte la casse du nom du dépôt.

### 8. Rattacher les comptes au foyer

Ouvrez l'app, entrez votre adresse, recevez le code, saisissez-le.

L'app vous accueille alors avec un écran qui dit que votre compte n'est
rattaché à aucun foyer — c'est normal, c'est la dernière étape. **Cet écran
affiche la requête SQL exacte, avec votre identifiant déjà dedans.** Copiez-la,
collez-la dans le SQL Editor de Supabase, changez le prénom, exécutez.

Elle ressemble à ceci :

```sql
insert into public.household_members (user_id, household_id, prenom)
values ('00000000-0000-0000-0000-000000000000',
        (select id from public.households limit 1),
        'Pauline');
```

Revenez dans l'app, appuyez sur **C'est fait — réessayer**. Vous y êtes.

**Pour le second téléphone**, exactement la même chose : votre conjoint ouvre
l'app, se connecte avec **sa** propre adresse, tombe sur le même écran, vous
envoie la requête affichée, et vous l'exécutez en changeant le prénom. Les
deux comptes pointent alors sur le même foyer et voient la même ardoise, en
temps réel.

> Il n'y a volontairement pas d'écran d'administration pour ça. Les tables
> `households` et `household_members` sont en **lecture seule depuis l'app** :
> aucune policy d'écriture n'existe. Personne ne peut donc se rattacher à
> votre foyer depuis un navigateur, même en connaissant la clef anon.

### 9. Ajouter à l'écran d'accueil de l'iPhone

**Depuis Safari uniquement.** Chrome et Firefox sur iOS ne proposent pas
l'installation — le menu de partage n'affiche simplement pas l'option.

1. Ouvrez `https://popsinette.github.io/Ardoise/` dans **Safari**
2. Bouton **Partager** (le carré avec la flèche, en bas)
3. Faites défiler et choisissez **Sur l'écran d'accueil**
4. Validez avec **Ajouter**

L'icône apparaît sur l'écran d'accueil. Lancée de là, Ardoise s'ouvre en
plein écran, sans la barre de Safari, et la session reste ouverte : on se
connecte une fois par appareil et on n'y repense plus.

---

## Ce qu'il faut savoir ensuite

### Modifier l'app

Poussez sur `main`, attendez la mise en ligne, rouvrez l'app. Le service
worker sert la version en cache pour un démarrage instantané et récupère la
nouvelle en arrière-plan : **votre changement apparaît au lancement suivant**,
et l'app vous propose alors de recharger. Il n'y a pas de numéro de version à
incrémenter à la main.

### Si le projet Supabase se met en pause

Sur l'offre gratuite, un projet sans activité pendant une semaine est mis en
pause. Ardoise étant consultée régulièrement, cela n'arrive pas en usage
normal — mais après de longues vacances, il faut le réveiller depuis le
tableau de bord Supabase (**Restore project**). Les données sont conservées.

### Épingler la version de la bibliothèque

`data.js` charge `@supabase/supabase-js@2` depuis jsDelivr, ce qui suit les
mises à jour de la branche 2. Pour figer une version précise, remplacez dans
`data.js` :

```js
const CDN_SUPABASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
```

---

## Comment c'est fait

```
index.html          la coque : métadonnées PWA, safe areas, rien d'autre
app.js              logique et vues — les 4 écrans, les 2 fiches, les panneaux
data.js             Supabase : auth, requêtes, temps réel, file hors ligne
styles.css          le système visuel : jetons, typographie, composants
config.js           URL du projet + clef anon (à remplir)
config.example.js   le modèle, si vous repartez de zéro
manifest.json       PWA : nom, icônes, affichage plein écran
404.html            ramène dans l'app quand une adresse est mal recopiée
sw.js               service worker : coque en cache, données jamais
schema.sql          le schéma Postgres complet, RLS comprise
icons/              l'icône, en SVG et en PNG aux tailles utiles
fonts/              Bricolage Grotesque, variable, auto-hébergée
.essais/            le banc d'essai (facultatif — voir plus bas)
```

`app.js` ne parle jamais à Supabase directement : il lit l'état exposé par
`data.js` et appelle ses fonctions. Toute la complexité réseau — cache,
file d'attente, reprise — est donc à un seul endroit.

### Le modèle de données

| Table | Ce qu'elle porte |
|---|---|
| `households` | le foyer |
| `household_members` | qui en fait partie, et sous quel prénom |
| `rooms` | les pièces de la maison — l'unité d'organisation de l'app |
| `artisans` | le carnet d'adresses |
| `tasks` | tout ce qu'il y a à faire, quelle qu'en soit la nature |
| `task_completions` | l'historique : une ligne par passage |

Bricolage, entretien et chantiers vivent dans **la même table** `tasks`,
distingués par la colonne `nature`. C'est ce qui permet de tout voir au même
endroit dans l'onglet *Tout*, et de filtrer sur `nature = 'artisan'` pour
l'onglet *Chantiers*.

**`task_completions` est un ajout au modèle initial, et il est nécessaire.**
Une tâche récurrente cochée n'est pas archivée : son échéance avance et elle
repasse à faire. Sans table d'historique, elle écraserait donc sa propre date
de réalisation à chaque passage, et « l'historique est conservé » serait faux.

### La récurrence

Cocher une tâche ne passe pas par un simple `update` : c'est la fonction
Postgres `complete_task()` qui, en une seule transaction, écrit l'historique
puis décide de la suite.

- **Tâche ponctuelle** → statut `fait`, elle sort des listes.
- **Tâche récurrente** → elle reste, son échéance avance de sa période, et
  elle repasse à `à faire`.

L'échéance avance **d'autant de cycles qu'il faut pour retomber dans le
futur** : une tâche trimestrielle oubliée pendant huit mois ne doit pas
réapparaître en retard à la seconde où on vient de la faire.

Ce calcul est côté base et non côté téléphone, pour que les deux appareils
aboutissent au même résultat même en cochant au même moment.

### Le hors ligne

- La dernière liste connue est gardée dans IndexedDB et s'affiche
  immédiatement, avant même de savoir si le réseau répond.
- Les écritures faites sans connexion partent dans une file, également en
  IndexedDB, et sont rejouées dans l'ordre au retour du réseau.
- Une écriture refusée par le serveur (droits, données invalides) est retirée
  de la file et signalée : la rejouer indéfiniment ne la ferait pas passer.
- Un bandeau discret, au-dessus de la ligne d'écriture, dit l'état et ce qui
  va se passer. Il disparaît dès que tout est envoyé.

L'app s'ouvre et reste consultable même au tout premier lancement sans
réseau, et même si le CDN est injoignable.

### La sécurité, en une minute

Le dépôt est public et la clef anon est dans le code. Ce qui protège vos
données, ce sont **exclusivement** les policies RLS de `schema.sql` :

- les six tables ont `row level security` activée, sans exception ;
- `rooms`, `artisans`, `tasks` et `task_completions` sont filtrées sur le
  foyer de l'utilisateur connecté, en lecture **comme** en écriture ;
- `households` et `household_members` sont en lecture seule depuis l'app ;
- la fonction `current_household_id()` est en `security definer` — sans quoi
  les policies qui lisent `household_members` s'appelleraient elles-mêmes à
  l'infini. Elle ne prend aucun paramètre et ne lit que `auth.uid()`, donc
  elle ne peut pas servir à consulter le foyer d'un autre.

Pour vérifier que tout est bien en place :

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
select tablename, policyname, cmd from pg_policies where schemaname = 'public';
```

---

## La direction artistique, en bref

Le nom du dépôt fait le sujet. Une ardoise, c'est à la fois **le matériau du
toit** et **la surface où l'on inscrit ce qui reste à faire**. L'app est donc
un **relevé** — quelque chose qu'on tient — et pas un tableau de bord.

- **Pas de cartes.** Des filets et de la typographie, comme sur un devis. Un
  filet sépare, il n'encadre jamais : aucune boîte, aucune ombre portée.
- **Une seule couleur de signal.** Le minium — la peinture antirouille
  orangée des ferronneries — signale le retard, et une seule autre chose : le
  bouton qui confirme une suppression définitive. Le lien « Supprimer » qui y
  mène, lui, reste neutre. Trois « Supprimer » rouges alignés dans un
  panneau, c'est exactement le « si tout est coloré, plus rien n'est urgent »
  qu'on cherche à éviter — la couleur n'apparaît qu'au moment où quelque
  chose est réellement en jeu. Un test automatique vérifie cette règle, sur
  les écrans comme dans les panneaux.
- **Une famille, deux axes.** Bricolage Grotesque en variable : les titres
  sont resserrés (`wdth 78–84`), le texte courant reste large. C'est ce qui
  justifie une variable plutôt qu'une grotesque de plus.
- **Le statut est structurel.** Une graduation de menuisier (`▮▮▯▯`) encode
  l'avancement d'un chantier *et* l'appréciation d'un artisan ; la priorité
  passe dans la graisse du titre. Pas une pastille de couleur de plus.
- **Trois mouvements seulement** : la coche, l'échéance d'une récurrente qui
  avance, le volet qui monte. Tout est désactivé sous
  `prefers-reduced-motion`.

Les jetons sont nommés d'après des matières — `--platre`, `--volet`,
`--laiton`, `--minium`, `--mine`, `--filet` — et redéfinis en mode sombre,
où le plâtre du mur devient l'ardoise mouillée du toit. Les dix couleurs de
texte passent le niveau AA dans les deux modes.

### L'ajout rapide

Ce n'est pas un bouton flottant rond, c'est une **ligne d'écriture** ancrée
au-dessus des onglets, présente sur les quatre écrans. Un appui, le clavier
monte, le champ a déjà le focus : titre, pièce, Entrée. La pièce du dernier
ajout est pré-sélectionnée, parce qu'on ajoute souvent deux choses de suite
dans la même pièce. Tout le reste — coût, échéance, artisan, récurrence — se
complète plus tard dans la fiche.

---

## Le banc d'essai (facultatif)

`.essais/` contient de quoi rejouer la vérification complète dans un
navigateur, avec une couche Supabase simulée. **Rien de tout cela n'est
nécessaire pour faire tourner l'app** : c'est un outil de développement, il
n'est jamais chargé par `index.html`.

```bash
node .essais/banc.mjs
```

Le banc sert le dépôt sous `/Ardoise/` — la forme exacte de GitHub Pages,
ce qui teste réellement les chemins relatifs et la portée du service worker —
puis vérifie :

- toutes les cibles tactiles font au moins 44 px ;
- aucun débordement horizontal de 375 à 430 px ;
- le minium n'apparaît que sur du retard — écrans et panneaux compris ;
- cocher une récurrente appelle `complete_task` et repousse l'échéance sans
  archiver la tâche ;
- l'ajout rapide insère bien la tâche avec sa pièce ;
- le service worker s'enregistre sur le sous-chemin et précharge la coque ;
- **l'app s'ouvre hors ligne, sans réseau ni CDN, sur la dernière liste
  connue**, et le dit.

Il dépose aussi des captures d'écran dans `.essais/captures/`, en clair et en
sombre, à 375 et 430 px.

Il faut Node et Playwright (Chromium) sur la machine — jamais sur le
téléphone, et jamais pour déployer.

---

## Dépannage

**« Ce code n'est plus valable »** — le code expire après une heure. Demandez-en
un nouveau depuis l'écran de connexion.

**Je reçois un lien au lieu d'un code** — les modèles d'email n'ont pas été
modifiés. Reprenez l'étape 4 : il faut `{{ .Token }}` dans **Magic Link** *et*
dans **Confirm signup**.

**Je ne reçois aucun email** — regardez les indésirables, puis le quota : le
serveur d'envoi intégré à Supabase est bridé à quelques messages par heure.

**« Votre compte n'est pas rattaché au foyer »** — c'est l'étape 8, et elle
est normale à la première connexion de chaque appareil.

**L'app affiche l'écran d'installation alors que `config.js` est rempli** —
le service worker sert encore l'ancienne version. Rechargez une fois, ou
retirez l'app de l'écran d'accueil et rajoutez-la.

**Les modifications de l'un n'apparaissent pas chez l'autre** — vérifiez que
les tables sont bien publiées en temps réel :

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

Vous devez y voir `tasks`, `rooms` et `artisans`. Sinon, relancez
`schema.sql`.

**Pages est activé mais l'URL ne répond pas / reste en 404** — activer Pages
ne déclenche pas toujours la première construction. Poussez n'importe quel
commit sur `main` : le build part alors immédiatement. Pour vérifier, l'onglet
[Actions](https://github.com/Popsinette/Ardoise/actions) doit montrer une
exécution **pages build and deployment** en succès. S'il n'y en a aucune,
c'est qu'aucune construction n'a jamais eu lieu — et pas que le contenu est
en cause.

**Safari ne propose pas « Sur l'écran d'accueil »** — vous êtes dans Chrome ou
Firefox. Sur iOS, seul Safari installe une PWA.

---

## Licences

Le code de ce dépôt est à vous. La police **Bricolage Grotesque**, dans
`fonts/`, est distribuée sous [SIL Open Font License
1.1](https://openfontlicense.org) — elle peut être redistribuée librement, y
compris dans un dépôt public. Voir `fonts/OFL.txt`.
