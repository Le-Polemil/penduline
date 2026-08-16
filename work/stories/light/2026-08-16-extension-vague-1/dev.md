---
story: "Lot Vague 1 — extension"
story_code: "extension-vague-1"
issues: [11, 29, 16, 52]
created: 2026-08-16
status: "In Progress"
---

# Journal de développement

## Progression

| # | Tâche | Issue | Statut | Date |
|---|-------|-------|--------|------|
| 1 | Afficher « À trier » dans le popup (`ALL` au lieu de `QUADS`) | #11 | Terminé | 2026-08-16 |
| 2 | `addBoard` + formulaire de création dans le popup | #29 | Terminé | 2026-08-16 |
| 3 | Maquette du sélecteur de case dans Claude Design (« Organic ») | #16 | Terminé | 2026-08-16 |
| 4 | Intégration CSS de la géométrie validée | #16 | Terminé | 2026-08-16 |
| 5 | Menu contextuel, client Supabase dans le worker, badge | #52 | Terminé | 2026-08-16 |
| 6 | Manifeste : `contextMenus` + version 1.1.0 | #52 | Terminé | 2026-08-16 |
| 7 | Documentation (`work/publication-extension.md`) | — | Terminé | 2026-08-16 |
| 8 | Vérifications qualité + test manuel | — | Terminé | 2026-08-16 |

## Journal

<!-- Les entrées sont ajoutées ici après chaque action concrète. -->

### 2026-08-16 — Tâche 1 (#11) : afficher « À trier » dans le popup

**Statut** : Terminé

**Actions réalisées** :
- `ALL` au lieu de `QUADS` sur les trois itérations visées par le ticket : carrés
  de filtre, liste des cases, carrés d'ajout.
- Helper `quadBg()` pour le repli de fond de « À trier ».
- Jeton `--color-neutral-200` ajouté à l'extension.

**Fichiers modifiés** :
- `apps/extension/src/App.tsx`
- `apps/extension/src/styles.css`

**Notes** :

*Deux usages que le ticket ne listait pas devaient être corrigés aussi.* Le
ticket citait trois lignes ; il y en avait cinq. `addQuadObj` cherchait la case
d'ajout dans `QUADS` avec un repli `?? QUADS[0]` : sélectionner « À trier »
serait retombé silencieusement sur « Faire », donc la tâche serait partie dans
la mauvaise case. Et le libellé du bandeau de filtre, cherché lui aussi dans
`QUADS`, aurait affiché un vide. Deux bugs qui ne se seraient manifestés
qu'*après* avoir rendu le parking sélectionnable — c'est-à-dire introduits par
la correction elle-même.

*Le fond transparent n'est pas un oubli côté web.* `PARK.bg` vaut
`'transparent'` parce que sur le web la zone occupe toute la largeur sous la
grille et se fond volontairement dans la page. Dans le popup, « À trier » est
une case comme les autres : il lui faut un fond. D'où le helper plutôt qu'une
modification de `quadrants.ts`, qui aurait changé le rendu web pour rien.

*Deux `QUADS` subsistent, volontairement* : les pastilles de l'accueil (asymétrie
préexistante et identique côté web — une matrice ne contenant que du parking
apparaît active sans pastille) et la grille du logo, qui est un 2×2 par
définition.

**Vérifications** : `npm run typecheck` et `npm run build:ext` passent. Rendu à
vérifier à l'écran une fois la géométrie de la tâche 4 en place — c'est
maintenant une grille de 5 dans un conteneur câblé en 2×2.

### 2026-08-16 — Tâche 2 (#29) : créer une matrice depuis le popup

**Statut** : Terminé

**Actions réalisées** :
- `addBoard(name)` dans `ExtStore`, en miroir du web : même calcul de `position`
  (`max + 1`), même retour d'identifiant.
- Formulaire dans l'accueil du popup : bouton au repos → champ à la saisie,
  Entrée valide, Échap annule.
- L'état vide propose désormais la création sur place.
- Styles `.add-board*` pour l'extension.

**Fichiers modifiés** :
- `apps/extension/src/store.ts`
- `apps/extension/src/App.tsx`
- `apps/extension/src/styles.css`

**Notes** :

*Deux écarts assumés avec le web, tous deux imposés par les 400 px du popup.*
Le formulaire web aligne « Créer » **et** « Annuler » en toutes lettres à côté du
champ ; transposé tel quel, il ne laisserait presque rien pour saisir le nom.
L'annulation passe donc par une croix. Et là où le web laisse volontairement la
nouvelle matrice apparaître en bout de liste sans rediriger, le popup **l'ouvre
directement** : dans une fenêtre qui se ferme au moindre clic ailleurs, revenir
chercher dans une liste ce qu'on vient de nommer serait une étape de trop.

*L'état vide ne renvoie plus vers le web.* C'était le seul endroit où l'extension
avouait son incomplétude, et il tombait au pire moment — la toute première
utilisation. Le message reprend le vocabulaire de l'accueil web (« une pièce, une
journée, un projet… ») pour dire que le découpage appartient à l'utilisateur.

**Vérifications** : `npm run typecheck` et `npm run build:ext` passent.

### 2026-08-16 — Tâche 3 (#16) : maquette du sélecteur de case

**Statut** : Terminé — en attente de validation

**Actions réalisées** :
- `components/quadrant-picker.html` poussé dans le projet Claude Design
  **« Organic »** (`7d3fcc3c-…`), celui que citent `quadrants.ts` et le README.
- Cinq propositions : A anneau, B encoches, C disque surélevé, D barre sous la
  grille, B′ encoches sans compteur.
- Chaque variante à taille réelle **et** en situation dans un en-tête de popup
  de 400 px.

**Fichiers modifiés** : *(hors dépôt)* projet Claude Design « Organic ».

**Notes** :

*Le `theme.json` d'« Organic » porte exactement la palette de l'app* (`#f5ead8`,
`#c67139`, Caprasimo + Figtree). La maquette s'appuie donc sur ses vrais jetons ;
seules les cinq couleurs de case sont déclarées localement, parce qu'elles sont
des données produit (`quadrants.ts`) et non des jetons de thème.

*La maquette a corrigé une affirmation fausse de ma part.* J'avais décrit la
variante B comme « le disque tombe dans un trou, rien ne se chevauche ». Le rendu
montre l'inverse : le disque **chevauche** bien les encoches. Ce qui change, c'est
que les quatre courbes pointent vers lui, donc l'œil lit un objet avec un centre
plutôt qu'une pastille posée sur une grille. Description rectifiée avant l'envoi —
une doc de design system qui décrit mal ce qu'elle montre est pire qu'absente.

*La mise en situation a révélé le vrai problème, que la comparaison abstraite
masquait.* **Le compteur du disque central est illisible à taille réelle.** Une
tuile fait 16 px avec un chiffre à 9 px ; pour porter le même poids, le disque
devrait être plus large qu'une tuile — ce que le centre d'un 2×2 ne peut pas
donner. C'est une limite géométrique, pas un réglage : aucune des variantes A à D
ne la résout.

D'où **B′** : le disque abandonne le chiffre et signale la *présence* plutôt que
la quantité — plein quand la zone contient quelque chose, creux quand elle est
vide. Le compte exact figure déjà dans l'en-tête de la case, un cran plus bas.
Plein/creux se distingue nettement à 16 px, là où un chiffre ne passait pas.

**Prochaine étape** : validation par l'utilisateur avant intégration (tâche 4).

### 2026-08-16 — Tâche 3 (suite) : itérations sur la maquette

**Statut** : Terminé — en attente de validation finale

**Actions réalisées** :
- Variante **A** retenue par l'utilisateur, avec disque et chiffre plus grands.
- Étude de tailles (0.72 / 0.88 / 1.00 / 1.12), puis test à **deux chiffres**.
- Variantes **A″** (chiffres des tuiles dans leur coin extérieur) et **A‴**
  (disque qui grandit au survol, « + » au repos au-delà de neuf).

**Notes** :

*Le test à deux chiffres, demandé par l'utilisateur, a invalidé ma recommandation.*
Je préconisais un disque à 1.00. Avec des compteurs à deux caractères, le disque
**recouvre** le deuxième chiffre des tuiles — à 0.88 comme à 1.12. Ce n'était pas
un problème de taille de disque : **cinq nombres tiraient tous vers le même
centre**. Un 2×2 de 16 px n'a pas la place pour ça.

*D'où A″* : chaque tuile pousse son chiffre dans le coin qu'elle occupe déjà
(haut-gauche pour la tuile haut-gauche, etc.). Le milieu se vide, le disque a
toute la jonction pour lui à n'importe quelle taille. Effet secondaire heureux —
chaque chiffre est désormais *dans* son quadrant plutôt qu'au milieu d'un carré,
et les quatre coins encadrent le centre, ce qui sert précisément l'intention de
#16.

*Puis A‴*, sur deux demandes successives de l'utilisateur : le disque repose à
0.72 et grandit à 1.00 au survol, pendant que les quatre compteurs reculent d'un
cran. Deux points traités au passage — `:focus-visible` déclenche le même état
(un compte accessible à la seule souris serait un compte que les utilisateurs au
clavier n'obtiennent jamais), et `prefers-reduced-motion` supprime le mouvement
sans supprimer la révélation.

*Le « + » au repos* règle la dernière contradiction : deux chiffres ne tiennent
pas à 0.72. Le disque affiche donc son compte tant qu'il fait un caractère, et un
« + » au-delà de neuf — il dit « il y en a beaucoup » sans prétendre à une
précision qu'il ne peut pas rendre. Le survol donne le chiffre exact.

### 2026-08-16 — Tâche 4 (#16) : intégration de la géométrie

**Statut** : Terminé

**Actions réalisées** :
- Rendu explicite au lieu de `ALL.map()` : les quatre tuiles d'un côté, le
  disque de l'autre. Composant `ParkSquare` pour le centre.
- CSS : coins extérieurs arrondis, coin central carré, disque en `position:
  absolute` avec anneau couleur de page.
- Disque à 72 % au repos, 100 % au survol, au focus clavier et à la sélection.
- Compteurs des tuiles réduits pendant que le centre est mis en avant.
- Pied de page : géométrie seule, sans mécanique de survol.

**Fichiers modifiés** :
- `apps/extension/src/App.tsx`
- `apps/extension/src/styles.css`

**Notes** :

*Le centrage du « + », signalé par l'utilisateur, était bien faux.* Mesures dans
Figtree Bold à 9 px, ligne de 16 px, boîte de 16 px :

| Glyphe | Écart de l'encre au centre |
|---|---|
| `5` | 0,404 px trop bas |
| `14` | 0,350 px trop bas |
| `+` sans correction | **0,818 px trop bas** |

Le « + » est centré sur l'axe mathématique de la fonte, pas sur la hauteur des
chiffres. Ma première correction (0,06 em) le remontait **trop** : il serait passé
au-dessus des chiffres. La bonne valeur est l'écart exact entre les deux,
0,818 − 0,404 = **0,046 em**, qui l'aligne sur eux plutôt que sur le centre
géométrique.

*Constat plus large, hors périmètre* : les 0,404 px communs à tous les chiffres
viennent de l'asymétrie de la fonte (ascendante 9, descendante 2) que
`line-height` ne compense pas. Uniforme sur les cinq zones, donc cohérent — noté,
pas corrigé ici.

*Une contrainte du code a modifié le rendu prévu.* La maquette faisait reculer les
compteurs par la taille **et** l'opacité. Impossible en l'état : les tuiles portent
leur `opacity` en style inline (gestion du filtre), qui l'emporte sur la feuille de
style. Le recul se fait donc par la taille seule — l'effet demandé est là, la
nuance d'opacité en moins.

*Vérification sur le CSS buildé*, pas sur les sources : un harnais reproduisant le
balisage de l'en-tête, chargé avec `dist/assets/popup-*.css`, ce qui évite d'avoir
à ouvrir une session pour juger cinq états (repos à un et deux chiffres, centre
sélectionné, tuile sélectionnée, pied de page).

### 2026-08-16 — Tâches 5 et 6 (#52) : capture depuis la page consultée

**Statut** : Terminé

**Actions réalisées** :
- `background.ts` passe de 6 lignes à un vrai composant : menus contextuels,
  client Supabase, capture, retour par badge.
- Entrée directe vers la dernière matrice active + sous-menu « Autre matrice ».
- Contextes `selection`, `link`, `page` ; titre pris dans cet ordre de précision.
- Le popup pousse sa liste de matrices au worker par `chrome.runtime.sendMessage`.
- Nouveau module `active-board.ts`.
- Manifeste : `contextMenus` ajouté, version passée à **1.1.0**.

**Fichiers modifiés** :
- `apps/extension/src/background.ts`
- `apps/extension/src/active-board.ts` (nouveau)
- `apps/extension/src/store.ts`, `apps/extension/src/App.tsx`
- `apps/extension/public/manifest.json`

**Notes** :

*Le build a révélé un défaut que le code ne montrait pas.* Le service worker
importait `getActiveBoard` depuis `store.ts` — qui importe React pour ses hooks.
Résultat : un chunk partagé de **225 Ko contenant React**, chargé par le worker à
chaque réveil. Or MV3 tue et relance ce worker en permanence : c'était du parse
répété pour du code qui n'y sert jamais.

D'où `active-board.ts`, module sans React. Après découpage :

| | Avant | Après |
|---|---|---|
| Chunk du worker | 225 Ko, **React inclus** | 217 Ko, sans React |
| `popup.js` | 371 Ko | 156 Ko |

*Ce qui reste et pourquoi on l'accepte* : les 217 Ko sont supabase-js, dont le
worker a besoin pour écrire. On pourrait descendre à quelques kilo-octets en
tapant PostgREST au `fetch` — mais il faudrait réimplémenter à la main le
rafraîchissement du jeton d'accès, qui peut avoir expiré entre deux réveils.
Échanger de la correction contre du temps de démarrage n'en vaut pas la peine ici.

*Le retour passe par le badge, pas par une notification.* `chrome.notifications`
coûterait une permission de plus, alors que tout le travail consigné dans
`work/publication-extension.md` a consisté à garder ce manifeste minimal. Le badge
couvre aussi **l'échec** : session absente, aucune matrice, écriture refusée. Une
capture perdue en silence serait pire que pas de capture — l'utilisateur croirait
avoir rangé quelque chose.

*La liste des matrices vient du popup, pas d'une requête du worker.*
`chrome.contextMenus` exige des entrées enregistrées à l'avance ; faire interroger
Supabase par un worker qui peut mourir à tout instant aurait créé une seconde
source de vérité pour rien. Un cache `chrome.storage.local` couvre le démarrage à
froid, avant toute ouverture du popup.

### 2026-08-16 — Tâches 7 et 8 : documentation et vérifications

**Statut** : Terminé

**Actions réalisées** :
- `work/publication-extension.md` : justification de `contextMenus`, déclaration
  d'usage des données corrigée, notes de publication 1.1.0.
- `npm run typecheck` et `npm run build` : aucune erreur, trois workspaces.

**Fichiers modifiés** :
- `work/publication-extension.md`

**Notes** :

*Une conséquence de #52 que le ticket ne prévoyait pas, et qui touche la
conformité.* La doc de publication affirmait « ne PAS cocher contenu des sites
web : l'extension ne lit aucune page ». **C'est devenu faux.** Capturer un texte
sélectionné, l'URL d'un lien ou le titre d'une page relève de la catégorie
« contenu des sites web » du formulaire Google — même si la lecture est déclenchée
par l'utilisateur et bornée à ce qu'il a désigné.

La case doit donc être cochée à partir de la 1.1.0, avec une justification. Sous-
déclarer est le meilleur moyen de se faire retirer du Store, et c'est précisément
le genre de détail qui se perd entre l'écriture d'un ticket et la soumission d'un
paquet — d'où sa consignation.

À noter en revanche : `contextMenus` **n'affiche aucun avertissement à
l'installation**, et n'entraîne pas d'examen approfondi comme l'aurait fait une
autorisation d'hôte. Le travail fait en 1.0.0 pour garder un manifeste minimal
reste donc valable.

**Reste à faire, côté utilisateur** : les points 8 à 13 du plan de test demandent
l'extension chargée dans Chrome (menu contextuel, badge, session absente) — ils ne
sont pas vérifiables depuis un harnais.
