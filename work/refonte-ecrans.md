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

## « Objectifs » : la case bien utilisée, pas la tâche abattue

Le barème d'origine du brief butait sur le schéma — « Déléguer +3 si validée quand Faire
est vide » demande l'état de « Faire » à l'INSTANT de la validation, qu'aucune table ne
conserve. Reformulé le 3 octobre : **chaque case a un usage optimal qui vaut plein tarif,
et des usages dégradés qui valent moins.** Tout redevient calculable.

| Case | Ce que la case promet | Mesure | Points |
|---|---|---|---|
| Faire | la traiter vite, soi-même | terminée ≤ 7 j après son entrée | +2 |
| | | terminée au-delà | +1 |
| | | encore ouverte, échéance passée | −1 |
| Planifier | lui donner une date, puis la tenir | datée **et** tenue | +4 |
| | | datée, en retard | +1 |
| | | jamais datée — la case n'a pas servi | 0 |
| Déléguer | qu'elle parte chez quelqu'un d'autre | cochée par quelqu'un d'autre | +5 |
| | | passée en ≤ 3 j | +3 |
| | | gardée plus longtemps | +1 |
| | | ouverte depuis > 14 j | −1 |
| Éliminer | qu'elle disparaisse | supprimée | +2 |
| | | **cochée** | −2 |
| À trier | qu'elle n'y reste pas | encore au parking après 14 j | −1 |

**La bascule qui rend « Déléguer » mesurable.** En solo, la tâche dans Déléguer n'est
presque jamais *le travail* : c'est **la passation**. « Appeler le plombier » n'est pas
« réparer la fuite ». La cocher soi-même est donc le bon usage, pas le dégradé — ce que
le premier barème prenait à l'envers. Le signal n'est pas *qui* a coché mais *combien de
temps ça a traîné* : une passation prend des minutes. `completed_by` ≠ l'auteur reste un
bonus, là où la délégation est constatée et plus seulement déclarée.

⚠️ **`by_other` est EXCLUSIF des deux cas de durée.** Noter aussi la durée d'une tâche
déléguée reviendrait à lui reprocher le temps passé chez son destinataire — exactement ce
qu'on voulait. Un test verrouille ce point, c'est le plus facile à casser du fichier.

⚠️ **Les pénalités sont affichées à part du total de période.** Elles viennent de tâches
encore ouvertes AUJOURD'HUI, qui ne se rattachent à aucune fenêtre : les mêmes seraient
recomptées à chaque période comparée, et la tendance deviendrait fausse. D'où
`points` / `snapshot` / `total` dans `GoalScore`.

### Deux trous de mesure, dits à l'écran

- `quadrant_changed_at` date de la revue périodique : rien d'avant ne se mesure sur la
  durée. Ces tâches sont comptées à part (`unmeasured`), pas notées zéro en silence.
- Une tâche **purgée** de la corbeille disparaît pour de bon : le +2 d'Éliminer s'efface
  avec elle, au bout de trente jours.

### Où vivent les seuils

Dans `packages/shared/src/goals.ts`, et nulle part ailleurs. `goal_stats` rend des faits
— une durée en secondes, un booléen — et n'applique aucun seuil. C'est la règle posée par
`review_boards` : les dupliquer en SQL serait deux vérités à tenir à jour, et celle des
deux qui dérive est toujours celle qu'on ne relit pas.

## Icônes : deux tracés, et lequel sert à quoi

`logo.png` (le « P » de l'en-tête) et `icon.svg` (le nid plein) sont **deux dessins
différents**, et c'est le second qui servait de favicon : l'onglet ne montrait pas ce que
montre la barre du haut.

`logo.svg` — vectorisation du tracé de l'en-tête, fournie le 3 octobre — prend le favicon
et les quatre icônes d'extension. Trois corrections sur le fichier reçu : `viewBox`
recadrée sur la boîte englobante (les tracés n'occupaient que 41 % de large d'un canevas
carré, et à 16 px la marque se perdait dans le vide), les cinq teintes remises sur les
jetons de `quadrants.ts`, et la ferraille de l'exporteur retirée.

⚠️ **Les icônes PWA ne changent pas.** La vectorisation est fidèle en petite taille, pas
assez pour les 192/512/1024 du manifeste : les régénérer depuis un tracé approximatif
serait reculer. Elles restent sur l'ancien nid plein jusqu'à ce qu'un vecteur propre
arrive — `scripts/icons.mjs` a déjà la forme qu'il faut pour les reprendre, une entrée de
plus. L'issue #151 reste ouverte sur ce seul point.

## Transitions : cinq gestes, et le nid qui répond

Les cinq familles retenues sur la planche de design (artifact `391jneVz9…`), dans
l'ordre où elles ont été livrées. Tout passe par `apps/web/src/lib/transitions.ts`.

| Famille | Planche | Le geste |
| --- | --- | --- |
| Navigation entre vues | E | le bandeau s'étire, le corps glisse dans le sens du voyage |
| Accueil → Matrice | E | la carte s'ouvre, les quatre cases montent en décalé |
| Aujourd'hui, « Terminer » | C | la tâche monte au nid |
| Revue, « Régler » | D | la carte part au nid, la pile se resserre |
| Univers → Vue globale | G | le plateau se déplie |

Les cinq finissent au nid : il se secoue quand on arrive quelque part, il encaisse
quand on règle quelque chose. C'est le fil qui tient l'ensemble, pas un ornement
répété.

### Le sens du voyage est une donnée, pas une devinette

`data-vt` sur `<html>` porte `on <dir>[ carte][ univers]` le temps de la transition,
et tout le CSS s'y accroche. `sensEntre(de, vers)` le déduit d'un rang fixe
(`home/board 0, focus 1, global 2, bilan 3`) : l'écran de départ et celui d'arrivée
suffisent, aucun historique à tenir.

### Trois mécaniques, et pourquoi pas une seule

- **View Transitions** pour ce qui existe des deux côtés du changement d'écran.
- **Web Animations** pour la secousse du nid : elle doit se déclencher APRÈS le
  `startViewTransition`, sur un élément qui ne bouge pas. Une animation CSS aurait
  demandé une classe à poser puis à retirer, et deux arrivées rapprochées se
  seraient marché dessus — `element.animate()` rejoue proprement.
- **Un fantôme cloné** (`envoyerAuNid`) pour ce qui part au nid. ⚠️ Pas une view
  transition : l'élément DISPARAÎT du DOM et la liste se resserre dans le même
  geste. Lui donner un `view-transition-name` l'aurait fait voler depuis une place
  déjà réattribuée. Le clone est sorti du flux, les `id` retirés — sans ça deux
  éléments partagent une ancre et les `aria-labelledby` de la page se brisent.

### Le nid a deux secousses, pas une

Les planches en décrivent deux, et les confondre se voit. Un saut d'un écran à l'autre
est un voyage : 640 ms, large (9° → −5° → 2°). Une carte qui s'ouvre ou un plateau qui
se déplie reste sur place : 440 ms, plus serré (9° → −3,5° → 1°), pour que le nid
s'apaise **avec** le bandeau. Unifier sur 640 ms faisait traîner le nid 200 ms après la
fin des deux gestes courts.

⚠️ **Elle part après la transition, pas avec elle** comme sur les planches. Le temps
d'une view transition, le DOM réel est masqué au profit des pseudo-éléments : une
animation posée sur le nid vivant ne se verrait pas. Les planches sont des pages
isolées, sans cette contrainte.

### Les noms, posés en JS

`pd-tray`, `pd-u-<board>-<case>`, `pd-card`… sont posés sur les éléments au moment du
clic et retirés à la fin (`oublierLesNoms`). Ils dépendent des données — quel univers,
quelles matrices non vides — et un `view-transition-name` doit être UNIQUE dans le
document : le laisser en CSS reviendrait à le poser sur chaque carte de l'accueil,
donc à en avoir douze identiques.

⚠️ **Le plateau garde ses deux instantanés.** Première version : escamoter old et new
pour peindre le groupe (rectangle qui grandit, couleur qui change). Les quatre cases
restaient alors VIDES toute la transition — les groupes de matrices volaient vers des
cadres invisibles, puisque les cases sont dans l'instantané d'arrivée. Le groupe anime
la géométrie, le croisement des instantanés fait le reste.

### Le garde de mouvement réduit est en double

Le plancher CSS de `styles.css` ne couvre pas les `::view-transition-*` : ils vivent
hors de l'arbre. `mouvementReduit()` (exporté depuis `viewTransition.ts`) coupe donc
en JS — `transitionDeVue` applique le changement sans transition, `envoyerAuNid` ne
clone rien. Même partage qu'en #91.
