# Refonte « DA Accueil 5 » — les écrans intérieurs

Brief et maquettes : `work/refonte-da/`. PR : #169, sur `feat/accueil-grand-header`.
Le *quoi* est dans le code et les commits ; ce fichier garde le *pourquoi*.

## Deux pièces partagées, et pourquoi elles ont cette forme

**`ScreenHero` est une coquille, pas un composant à props.** Les quatre écrans
intérieurs n'arrangent pas les mêmes choses dans le même ordre — la matrice met son
fil d'Ariane au-dessus du titre, la vue globale intercale une ligne de portées,
« Aujourd'hui » centre tout. Une signature assez large pour les couvrir toutes
(`eyebrow`, `title`, `pills`, `aside`…) serait une signature qui ne dit plus rien.

**Le décor du héros est dans sa propre couche.** `overflow: hidden` posé sur le
bandeau couperait le menu du sélecteur de matrice, qui descend sous la vague.

**`AxisGrid` veut ses cases en enfants DIRECTS** — sinon elles ne sont plus des
éléments de grille et la gouttière des axes s'effondre. Corollaire : le coin central
carré est passé des `nth-child` aux classes de case (`.quad--faire`…), les cases
n'étant plus les quatre premiers enfants.

## Le bandeau redéfinit `--q-*`

Le bandeau d'encre est la seule surface sombre de l'application, et il l'est dans les
DEUX thèmes. Plutôt qu'une seconde famille de variables (`--band-faire`…), on
redéfinit `--q-faire-ink` & co. à leurs valeurs sombres sur `.topbar, .hero, .shero` :
tout ce qui vit dans le bandeau écrit `var(--q-faire-ink)` sans savoir où il est monté,
et aucun composant n'a à choisir sa palette selon son point de montage.

⚠️ Un élément du bandeau qui retombe sur le fond de page — le menu du sélecteur —
hérite de ces teintes. Aucun n'utilise `--q-*` aujourd'hui ; le jour où l'un le fera,
il devra les remettre.

## Là où le code ne pouvait pas tenir la maquette

- **Revue, « Annuler » par ligne.** `store.undo()` défait le *dernier* geste, pas un
  geste choisi. Le bilan l'offre donc sur la dernière écriture et sur les mises en
  sommeil (locales, réversibles une par une). Promettre plus défairait autre chose que
  ce que la ligne montre. Même règle que `Suggestions.tsx`.
- **Revue, « Revue faite ».** L'horodatage reste posé à l'arrivée (#47 : consulter la
  revue EST la revue). Le bilan le constate ; en faire un bouton aurait fait mentir
  l'accueil (« revue jamais consultée ») jusqu'à ce qu'on aille au bout de la pile.
- **Revue, la pile garde l'ordre.** Une carte réglée quitte les signaux : on la
  réinsère À SA PLACE (`{ at, item }`), pas en fin de file — sinon la progression, les
  index de navigation et les couleurs de la jauge sautent sous les doigts.
- **Aujourd'hui, pas d'annulation locale.** Cocher passe par `useCompletion` et son
  toast « Annuler » ; le reste par `store.group`, donc `Ctrl+Z`. Un troisième mécanisme
  sur le même écran n'aurait pas ajouté une sécurité mais une question : lequel des
  deux « Annuler » défait quoi.
- **Aujourd'hui, l'ordre de passage est local.** « Passer devant » et « plus tard dans
  la journée » ne changent pas la tâche : ils changent l'ordre dans lequel on veut la
  voir arriver, aujourd'hui, sur cet appareil. Une colonne pour un ordre qui ne survit
  pas à la journée ne vaut pas sa migration.
- **Vue globale, pas de portée « Sans univers ».** `Scope` ne sait dire que « tout » ou
  « cet univers » ; une troisième variante toucherait un type que l'accueil et la vue
  persistée partagent. Ces matrices restent atteignables par « Toutes » — c'est déjà ce
  que faisait l'ancien menu.

## Ce que la carte de revue ne porte pas

Une carte de décision ne peut pas porter renommage, déplacement vers une autre matrice,
pièces jointes et étapes sans redevenir la liste qu'on fuyait. Chaque carte porte donc
« Ouvrir » : la matrice s'ouvre **sur la tâche**, mise en évidence (`focusTask`), là où
le menu ⋯ complet vit déjà. C'est la contrepartie du passage de `TaskCard` à la carte.

Deuxième effet : les matrices en lecture seule sortent de la revue, comme de « Ça
stagne ». Chaque carte demande une décision, et on ne demande pas une décision qu'on
n'a pas le droit d'appliquer.

## `focusCandidates` : seulement « Faire » et « Planifier »

Proposer une tâche de « Déléguer » serait se la refiler à soi-même ; une d'« Éliminer »
contredirait la décision qu'on vient d'y prendre ; une du parking trancherait par la
bande un tri qu'on n'a pas fait. Pur, `now` en paramètre, dans `packages/shared`.

## Extension : le prix de « Capturer cette page »

La permission `tabs` est **la première de la liste qui affiche un avertissement à
l'installation**. La fiche du Chrome Web Store change, la validation repart, et les
utilisateurs existants passent en « mise à jour en attente » — Chrome désactive
l'extension entre-temps. `activeTab` ne suffit pas : elle n'est accordée qu'au moment
où l'on invoque l'extension, et le panneau reste ouvert pendant qu'on change d'onglet.

Justification rédigée dans `work/publication-extension.md`. **Si le prix n'est pas jugé
acceptable, le bouton se retire seul** : tout le reste du panneau en est indépendant.

## Les trois arbitrages, tranchés le 3 octobre

1. **Accueil mobile** → barre d'onglets en bas. La ligne de pastilles défilante faisait
   NAÎTRE « Revue » et « Rétrospective » hors champ, et remontait avec la page.
2. **Rétrospective** → piste B, le récit. Tout ce qui précède les chapitres vit dans le
   bandeau, période comprise.
3. **« Objectifs »** → un onglet d'une section « Bilan » qui réunit les trois lectures
   du recul.

### « Bilan », pas « Stats »

La Revue est une pile de DÉCISIONS, pas une statistique : la ranger sous une étiquette
qui annonce des chiffres la ferait chercher ailleurs. Le regroupement règle aussi une
contrainte matérielle — la barre d'onglets du téléphone n'a que quatre à cinq
emplacements utilisables, et « Objectifs » aurait été le sixième.

La bande d'onglets se pose en TÊTE du bandeau, au-dessus du titre : un onglet change ce
titre, il ne peut donc pas vivre dessous, où il se lirait comme un filtre du contenu
courant. Chaque onglet reste un écran autonome, avec son état et son bandeau ;
`ScreenHero` prend un `tabs` et c'est tout le couplage.

## ⛔ « Objectifs » ne se calcule pas avec le schéma d'aujourd'hui

Le barème du brief demande trois choses que la base ne sait pas rendre :

| Règle | Ce qu'il faudrait |
|---|---|
| Faire +1 si fait en 7 jours | `quadrant_changed_at` → `completed_at` des tâches TERMINÉES. Le client ne charge que les ouvertes (#40), et `completion_stats` ne rend que des sommes. |
| Planifier +2 à temps, −1 en retard | Comparer `completed_at` à `due_at`, même problème. |
| Déléguer +3 si validée quand Faire est VIDE | L'état de « Faire » à l'INSTANT de la validation. **Aucune table ne le conserve** : ce n'est pas une requête manquante, c'est un fait non enregistré. |
| Éliminer +1 sortie ou supprimée, −2 cochée | Distinguer « sortie d'Éliminer » de « cochée dans Éliminer » : il faut l'historique des changements de case, pas seulement le dernier. |

Les trois premières lignes se règlent par une RPC de plus (une migration, sur le modèle
de `completion_stats`). La quatrième — et le `+3` de Déléguer — demandent un **journal
d'événements** sur les tâches, qui n'existe pas. À trancher avant de coder : barème
relâché sur ce que la base sait, ou journal d'événements d'abord.

## ⛔ Icônes : le tracé de l'en-tête n'existe qu'en 103 × 160

`apps/web/public/logo.png` (le « P » : branche, deux feuilles, nid suspendu) et
`apps/web/public/icon.svg` (le nid plein, qui sert de favicon et de source aux onze PNG
dérivés) sont **deux dessins différents**. Le second est le seul vecteur du dépôt, et
c'est l'ancien.

Pour aligner favicon, icônes PWA et icônes d'extension sur le tracé de l'en-tête, il
faut ce tracé en vecteur. Le canevas de design ne porte que le PNG, et 103 × 160 ne
monte pas à 512 ni à 1024 sans bouillie. Retracer à la main une marque de marque n'est
pas une décision de développement.

Reste donc à fournir un SVG (ou un PNG ≥ 1024) du nouveau logo ; le script de
régénération et le fond `#F5EAD8` des icônes PWA suivront — c'est l'issue #151, qui
demande déjà ce script.
