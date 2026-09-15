# Ardoise

Les travaux de la maison : le petit bricolage, l'entretien récurrent et les
chantiers avec artisans et budget.

**Aucun compte, aucun serveur, aucune configuration.** On ouvre, on écrit.
Tout reste sur le téléphone — comme Luna et Mes Budgets.

→ **[popsinette.github.io/Ardoise](https://popsinette.github.io/Ardoise/)**

---

## L'installer sur l'iPhone

C'est la seule mise en route, et elle prend trente secondes.

1. Ouvrez **[popsinette.github.io/Ardoise](https://popsinette.github.io/Ardoise/)**
   dans **Safari**
2. Bouton **Partager** en bas (le carré avec la flèche)
3. Faites défiler → **Sur l'écran d'accueil** → **Ajouter**

> **Safari uniquement.** Sur iOS, Chrome et Firefox ne proposent pas
> l'installation — le menu de partage n'affiche simplement pas l'option.

Lancée depuis l'écran d'accueil, Ardoise s'ouvre en plein écran, sans barre
de navigateur, et fonctionne sans réseau. Il n'y a rien à se connecter :
l'app est déjà la vôtre.

---

## S'en servir

**Quatre onglets, en bas, dans la zone du pouce.**

| Onglet | Ce qu'il montre |
|---|---|
| **Semaine** | ce qui est en retard, puis les sept jours qui viennent |
| **Tout** | la liste complète, filtrable, groupée par pièce |
| **Chantiers** | les tâches d'artisan, avec l'avancement et le budget |
| **Artisans** | le carnet d'adresses — un appui sur le numéro appelle |

**L'ajout rapide** est la ligne *« Écrire sur l'ardoise… »*, juste au-dessus
des onglets, présente sur les quatre écrans. Un appui, le clavier monte, on
tape le titre, on touche une pièce, Entrée. Trois secondes debout dans le
couloir. Le coût, l'échéance, l'artisan et la récurrence se complètent plus
tard, en ouvrant la tâche.

### Les tâches qui reviennent

Donnez une **récurrence** à une tâche (dans sa fiche : *tous les 3 mois*,
*tous les ans*…) et elle ne disparaîtra plus jamais quand vous la cochez :
son échéance avance toute seule et elle repasse à faire.

L'échéance avance d'autant de cycles qu'il faut pour retomber dans le futur.
Une tâche trimestrielle oubliée pendant huit mois ne réapparaît donc pas en
retard à la seconde où vous venez de la faire.

Chaque passage est gardé : la fiche affiche *« Faite 4 fois »* avec les dates
et ce que ça a coûté.

### Les réglages

Roue dentée en haut à droite : l'apparence (clair, sombre, automatique), les
prénoms du foyer, les pièces de la maison, la sauvegarde.

---

## Vos données

**Elles ne quittent pas le téléphone.** Ardoise n'a pas de serveur, ne
demande aucun compte, ne contient aucun traceur et ne fait aucun appel
réseau une fois installée. Tout est rangé dans le stockage privé du
navigateur (IndexedDB), isolé par site et protégé par le verrouillage de
l'appareil.

### La contrepartie, dite franchement

Personne d'autre ne détient vos données — donc **personne ne peut vous les
rendre si elles disparaissent.** Elles disparaîtraient si vous effaciez les
données de site de Safari, si vous supprimiez l'app de l'écran d'accueil, ou
si vous changiez de téléphone.

D'où le bouton **Exporter** dans les réglages. Il produit un fichier
`ardoise-2026-09-15.json` et l'envoie par la feuille de partage d'iOS —
AirDrop, Fichiers, mail, ce que vous voulez. **Restaurer une sauvegarde**
fait le chemin inverse.

Prenez-en une de temps en temps. C'est votre seul filet.

### Le second téléphone

Chaque téléphone a sa propre ardoise : **il n'y a pas de synchronisation
automatique** entre le vôtre et celui de votre conjoint. C'est le prix du
« sans serveur, sans compte ».

Pour partager une liste : **Exporter** sur un téléphone, l'envoyer par
AirDrop, **Restaurer une sauvegarde** sur l'autre. C'est un transfert manuel
et il remplace tout le contenu du téléphone qui reçoit — à faire quand l'un
des deux fait le point, pas tous les jours.

> Une version synchronisée en temps réel entre deux téléphones (Supabase,
> connexion par code email, Row Level Security) a été écrite puis mise de
> côté au profit de la simplicité. Elle reste dans l'historique git, au
> commit `84e874d`, si l'envie revient un jour.

---

## Modifier l'app

Poussez sur `main`, attendez une minute, rouvrez l'app. Le service worker
sert la version en cache pour un démarrage instantané et récupère la nouvelle
en arrière-plan : **votre changement apparaît au lancement suivant**, et
l'app propose alors de recharger. Aucun numéro de version à incrémenter.

Aucune étape de compilation, aucune dépendance : du HTML, du CSS et des
modules ES que GitHub Pages sert tels quels.

> Si l'URL ne répond pas alors que Pages est activé, poussez n'importe quel
> commit sur `main` : activer Pages ne déclenche pas toujours la première
> construction.

---

## Comment c'est fait

```
index.html          la coque : métadonnées PWA, safe areas, rien d'autre
app.js              logique et vues — les 4 écrans, les 2 fiches, les panneaux
data.js             les données : IndexedDB, sauvegarde, restauration
styles.css          le système visuel : jetons, typographie, composants
manifest.json       PWA : nom, icônes, affichage plein écran
sw.js               service worker : la coque en cache, pour l'ouverture
                    instantanée et le fonctionnement hors réseau
404.html            ramène dans l'app quand une adresse est mal recopiée
icons/              l'icône, en SVG et en PNG aux tailles utiles
fonts/              Bricolage Grotesque, variable, auto-hébergée
.essais/            le banc d'essai (facultatif — voir plus bas)
```

`app.js` ne touche jamais IndexedDB directement : il lit l'état exposé par
`data.js` et appelle ses fonctions.

### Ce que l'app garde

| Donnée | Ce qu'elle porte |
|---|---|
| `taches` | tout ce qu'il y a à faire, quelle qu'en soit la nature |
| `pieces` | les pièces de la maison — l'unité d'organisation de l'app |
| `artisans` | le carnet d'adresses |
| `passages` | l'historique : une ligne par tâche cochée |
| `reglages` | les prénoms du foyer, la date d'installation |

Bricolage, entretien et chantiers vivent dans **la même liste**, distingués
par leur `nature`. C'est ce qui permet de tout voir au même endroit dans
*Tout*, et de ne garder que `artisan` dans *Chantiers*.

---

## La direction artistique

Le nom fait le sujet. Une ardoise, c'est à la fois **le matériau du toit** et
**la surface où l'on inscrit ce qui reste à faire**. L'app est donc un
**relevé** — quelque chose qu'on tient — et pas un tableau de bord.

- **Pas de cartes.** Des filets et de la typographie, comme sur un devis. Un
  filet sépare, il n'encadre jamais : aucune boîte, aucune ombre portée.
- **Une seule couleur de signal.** Le minium — la peinture antirouille
  orangée des ferronneries — signale le retard, et une seule autre chose : le
  bouton qui confirme une suppression définitive. Le lien « Supprimer » qui y
  mène, lui, reste neutre. Trois « Supprimer » rouges alignés dans un
  panneau, c'est exactement le « si tout est coloré, plus rien n'est urgent »
  qu'on cherche à éviter. Un test automatique vérifie cette règle, sur les
  écrans comme dans les panneaux.
- **Une famille, deux axes.** Bricolage Grotesque en variable : les titres
  sont resserrés (`wdth 78–84`), le texte courant reste large. C'est ce qui
  justifie une variable plutôt qu'une grotesque de plus.
- **Le statut est structurel.** Une graduation de menuisier (`▮▮▯▯`) encode
  l'avancement d'un chantier *et* l'appréciation d'un artisan ; la priorité
  passe dans la graisse du titre. Pas une pastille de couleur de plus.
- **Trois mouvements seulement** : la coche, l'échéance d'une récurrente qui
  avance, le panneau qui monte. Tout est désactivé sous
  `prefers-reduced-motion`.

Les jetons sont nommés d'après des matières — `--platre`, `--volet`,
`--laiton`, `--minium`, `--mine`, `--filet` — et redéfinis en mode sombre, où
le plâtre du mur devient l'ardoise mouillée du toit. Les dix couleurs de
texte passent le niveau AA dans les deux modes.

---

## Le banc d'essai (facultatif)

`.essais/` contient de quoi rejouer la vérification complète dans un
navigateur. **Rien de tout cela n'est nécessaire pour faire tourner l'app** :
c'est un outil de développement, jamais chargé par `index.html`.

```bash
node .essais/banc.mjs
```

Le banc sert le dépôt sous `/Ardoise/` — la forme exacte de GitHub Pages, ce
qui teste réellement les chemins relatifs et la portée du service worker —
puis vérifie :

- toutes les cibles tactiles font au moins 44 px ;
- aucun débordement horizontal de 375 à 430 px ;
- le minium n'apparaît que sur du retard, écrans et panneaux compris ;
- cocher une récurrente repousse son échéance sans l'archiver, et garde le
  passage dans l'historique ;
- l'ajout rapide enregistre bien la tâche avec sa pièce ;
- les données survivent au rechargement ;
- **l'aller-retour export / import ne perd rien**, et un fichier étranger est
  refusé avec un message qui dit quoi faire ;
- le service worker s'enregistre sur le sous-chemin et précharge la coque ;
- **l'app s'ouvre sans réseau du tout**, avec sa liste.

Il dépose aussi des captures dans `.essais/captures/`, en clair et en sombre,
à 375 et 430 px. Il faut Node et Playwright (Chromium) sur la machine —
jamais sur le téléphone, et jamais pour déployer.

---

## Dépannage

**« Le stockage du navigateur est inaccessible »** — vous êtes en navigation
privée, où Safari bloque IndexedDB. Ouvrez Ardoise depuis l'écran d'accueil,
ou dans un onglet normal.

**Safari ne propose pas « Sur l'écran d'accueil »** — vous êtes dans Chrome ou
Firefox. Sur iOS, seul Safari installe une PWA.

**Mes tâches ont disparu** — les données sont propres à un navigateur et à un
appareil. Ouvrir l'app dans Chrome après l'avoir remplie dans Safari montre
une ardoise vierge, c'est normal. Si elles ont disparu là où vous les aviez
saisies, restaurez votre dernière sauvegarde.

**L'app ne prend pas ma dernière modification** — le service worker sert
d'abord la version en cache. Rechargez une seconde fois, ou retirez l'app de
l'écran d'accueil et rajoutez-la.

---

## Licences

Le code de ce dépôt est à vous. La police **Bricolage Grotesque**, dans
`fonts/`, est distribuée sous [SIL Open Font License
1.1](https://openfontlicense.org) — elle peut être redistribuée librement, y
compris dans un dépôt public. Voir `fonts/OFL.txt`.
