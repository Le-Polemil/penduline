---
story: "Correctif Mobile 3/3 — les animations"
story_code: "correctif-mobile-animations"
created: 2026-09-16
---

# Contexte

## Description fonctionnelle

Penduline anime beaucoup : une carte qui entre, un menu qui éclôt, une case qui grossit à la coche, un écran qui se substitue à un autre. Ces mouvements sont un langage, et le système d'exploitation offre à chacun de le refuser — « réduire les animations », une préférence que l'on active pour des troubles vestibulaires, des migraines, un mal des transports, ou simplement parce que le mouvement fatigue. Penduline ne l'honorait qu'**au tiers** : huit blocs la traitaient au cas par cas — la feuille modale, la ligne fraîche, le bandeau d'annulation, les champs d'ajout, le nid de chargement, le chevron d'univers, le clignotement d'arrivée, le balayage de carte — et tout le reste passait outre. Les cinq conteneurs d'écran, les cartes, les listes d'étapes et le volet de menu continuaient de glisser à l'entrée ; les deux menus continuaient d'éclore ; la case continuait de grossir ; les transitions de vue continuaient de se jouer ; vingt-cinq transitions continuaient de courir. **C'est un lot d'accessibilité avant d'être un lot de fluidité** : la valeur rendue n'est pas un gain de vitesse, c'est une préférence déclarée enfin respectée partout.

La fluidité, elle, a été **mesurée plutôt que supposée** — c'est ce que demandait le ticket, et la mesure a démenti son hypothèse. Sous bridage CPU 4× en 390 × 844 tactile, une seule animation saccade réellement : l'ouverture du champ « ＋ ajouter », une trame perdue, pire trame à 58,4 ms. Le clignotement d'arrivée en `box-shadow`, que le ticket soupçonnait de saccader parce que la propriété n'est pas composée, **ne saccade pas** : pire trame à 9,3 ms sur 1,6 s répété deux fois, zéro trame perdue. Même verdict pour le menu `⋯` et le balayage de carte. On ne refond donc rien de tout cela : on allège la seule animation coupable — quatre propriétés qui reposent la disposition à chaque trame ramenées à une — et on laisse le reste tranquille. Les deux lots précédents avaient d'ailleurs déjà retiré du tactile les animations les plus lourdes : interstices de dépôt et zones d'actions ne se déclenchent plus qu'au glisser et au survol, donc jamais au doigt.

Le périmètre tient en cinq gestes. La préférence est couverte **globalement**, en fin de feuille de styles, plutôt que par un neuvième bloc au cas par cas — c'est précisément la méthode au cas par cas qui a creusé le trou actuel, et la prochaine animation ajoutée serait de nouveau oubliée. Les huit blocs existants **restent** : ils ne règlent pas des durées mais **préservent des états** — le liseré qui remplace le clignotement, le nid de chargement remis droit — qu'une durée quasi nulle laisserait figés dans une position arbitraire. L'API View Transitions, que le CSS global ne peut pas atteindre, est court-circuitée sous la préférence. « ＋ ajouter » est allégé, pas refondu. Enfin des images-clés mortes sont supprimées, et un verrou de non-régression est posé sur la feuille de styles : toute animation déclarée doit être utilisée, la couverture globale doit exister, et aucun survol ne doit échapper à la garde introduite par le lot précédent.

Rien ne change pour qui n'a pas activé la préférence : mêmes écrans, mêmes données, mêmes parcours, et un rendu desktop strictement identique. Restent hors périmètre les interstices de dépôt et les zones d'actions, inatteignables au doigt depuis les deux lots précédents ; le glisser tactile réel, toujours absent et qui fera l'objet d'un ticket dédié ; et la case à cocher sans contour sur « Aujourd'hui » et « Revue », renvoyée en #92. Ce lot clôt la passe mobile en trois temps ouverte par #89 (géométrie) et #90 (survol). Une réserve de vérification à assumer : l'outil d'émulation disponible ne sait pas simuler la préférence système — le respect effectif de « réduire les animations » devra être constaté dans un vrai navigateur, préférence activée, et non en session.

Critères d'acceptation :

- Préférence « réduire les animations » activée dans le système : plus aucun mouvement sur les six écrans — les cartes et les écrans n'entrent plus en glissant, les deux menus n'éclosent plus, la case à cocher ne grossit plus à la coche, les transitions entre vues sont instantanées.
- Sous la même préférence, les états portés par les blocs existants sont préservés : le nid de chargement est immobile mais **droit**, et le liseré de la tâche arrivée est bien présent — l'information ne disparaît pas avec le mouvement.
- Sous la même préférence, l'ouverture de la corbeille se fait sans transition de vue : l'API est court-circuitée, pas seulement le CSS.
- Ouverture du champ « ＋ ajouter » à 390 × 844 sous bridage CPU 4× : pire trame nettement sous le seuil de 33 ms, contre 58,4 ms avant — c'est ce chiffre, relevé avec le même protocole qu'à l'audit, qui juge la tâche.
- Menu `⋯`, clignotement d'arrivée et balayage de carte : inchangés, zéro trame perdue, conformément à la mesure initiale.
- Après avoir coché une tâche à 390 px, le bandeau d'annulation tient dans la largeur, se pose au-dessus de la barre gestuelle, sa cible « Annuler » fait 44 px, et les 4 s s'écoulent sans que rien ne saute.
- À 1440 × 900, sans la préférence, les animations desktop sont inchangées.
- Le verrou de non-régression est en place et passant : aucune animation déclarée mais inutilisée, couverture globale présente, aucun `:hover` hors garde hormis l'exception documentée.
- `npm run typecheck`, `npm test` et `npm run build` passent.

## Vue architecturale

Le lot touche quatre pièces, dont une seule est neuve. `apps/web/src/styles.css` porte l'essentiel : la politique d'accessibilité du mouvement, l'allègement de l'ouverture de « ＋ ajouter » et la suppression de `mm-pinpulse`. `apps/web/src/lib/viewTransition.ts` (`withVT`) est le seul endroit du code où une animation est déclenchée depuis TypeScript, et c'est à ce titre qu'il est concerné. `apps/web/src/styles.test.ts`, nouveau, lit la feuille de styles comme une donnée. `apps/web/src/data/useCompletion.ts` n'est pas modifié : son délai de 4 s (#75) n'entre ici que comme objet de vérification en 390 px — le mécanisme est sain depuis #75, seul son rendu au doigt reste à constater.

```
  préférence système « moins d'animations »
                │
     ┌──────────┴───────────────────────────────┐
     │                                          │
  CSS (styles.css)                        JS (viewTransition.ts)
  plancher global en fin de fichier       withVT() court-circuite l'API
  + 8 blocs d'exception AU-DESSUS         ↑ appelé par Global / Matrix / Review
     │                                          │
  éléments du DOM                         pseudo-éléments ::view-transition-*
                                          (hors de portée du CSS de l'app)
                    │
             styles.test.ts  ── lit styles.css en texte, vérifie
                                les DÉCLARATIONS, pas le rendu
```

La décision structurante est un renversement de politique. Jusqu'ici `prefers-reduced-motion` était traité par ÉNUMÉRATION : huit blocs au cas par cas, couvrant environ un tiers du mouvement réel — `mm-in` (9 usages), `mm-pop`, `mm-check`, les transitions de vue et ~25 transitions restaient dehors. Le défaut de cette méthode n'est pas la taille du trou mais sa dynamique : le trou s'agrandit à chaque animation ajoutée, puisque couvrir une nouvelle animation demande de se souvenir d'écrire un neuvième bloc. On passe donc à une politique par DÉFAUT — un plancher de durée universel (`*, *::before, *::after`, en fin de fichier) — où l'oubli devient impossible parce qu'il n'y a plus rien à ne pas oublier. Les huit blocs existants ne disparaissent pas pour autant, et c'est le point non trivial : ils ne font pas la même chose que le plancher. Un plancher supprime une DURÉE ; eux préservent un ÉTAT — le liseré qui remplace le clignotement de `.task--flash`, le `rotate: 0deg` qui empêche le nid de chargement de se figer dans une position arbitraire. La règle devient donc « par défaut, tout est instantané ; explicitement, voici ce qui doit atterrir quelque part de précis », et l'ordre du fichier porte cette hiérarchie (exceptions d'abord, plancher ensuite). Le choix de `0.01ms` plutôt que `none` relève du même souci : une durée quasi nulle laisse jouer les `animation-fill-mode` et les états finaux, là où `none` ferait retomber certains éléments sur leur état initial.

Un plancher CSS ne peut cependant pas couvrir tout le mouvement, parce qu'une partie de ce mouvement ne vit pas dans le DOM de l'application. Les transitions de vue s'animent sur les pseudo-éléments `::view-transition-*`, montés par le navigateur dans une couche à laquelle le sélecteur universel de la feuille n'accède pas : la règle globale passe à côté, et l'animation de l'API se jouerait quand même. La même frontière doit donc être exprimée une seconde fois, en JavaScript, dans `withVT` — pseudo-code : `si (réduire le mouvement) → appliquer la mise à jour directement ; sinon → la passer à startViewTransition`. C'est exactement la forme déjà rencontrée en #89 et #90 : une caractéristique média lue à la fois par la feuille de styles et par un crochet React (`useTelephone`, `usePointeurFin`), parce que la décision doit être prise des deux côtés d'une frontière que ni l'un ni l'autre ne franchit seul. L'intérêt architectural est que `withVT` est déjà le point de passage unique de toutes les transitions de vue (une vingtaine d'appels répartis sur `Global`, `Matrix`, `Review`) et qu'il porte déjà une branche de dégradation pour les navigateurs sans `startViewTransition` : la condition s'élargit, la topologie ne change pas.

Reste le problème de la garde. Un plancher global et une garde JS ne valent que tant qu'ils sont là, et rien dans la chaîne actuelle ne les surveille : `tsc` ne lit pas le CSS, le build ne le valide pas, et les tests de rendu ne mesurent ni durée ni media query. `mm-pinpulse` — des images-clés déclarées et utilisées zéro fois, survivantes de l'épinglage — est la preuve vivante de cet angle mort. D'où `styles.test.ts`, qui applique à la feuille de styles le patron déjà posé par `apps/web/src/pwa/manifest.test.ts` : lire un fichier statique comme une donnée (via `?raw` de Vite, ce qui évite d'ajouter `@types/node` à l'app) et assener des invariants textuels — toute `@keyframes` déclarée est utilisée, le bloc global existe, aucune règle `:hover` ne vit hors de la garde `(hover: hover) and (pointer: fine)` sauf `a:hover`. Ce dernier verrou appartient conceptuellement à #90 mais n'a de valeur qu'une fois posé ; le placer ici transforme trois conventions écrites dans des commentaires en trois contraintes exécutables.

Deux impacts à assumer. Le premier est que la feuille de styles acquiert une règle `!important` universelle : elle gagne sur toute déclaration de durée, y compris future, y compris posée par erreur — c'est précisément ce qu'on veut, mais cela signifie qu'une animation devant impérativement conserver une durée sous la préférence devra désormais être déclarée en exception explicite, au-dessus du plancher, et le commentaire d'accompagnement doit le dire. Le second est le contrat de performance de « ＋ ajouter », seule animation mesurée comme saccadant (pire trame à 58,4 ms sous bridage CPU 4×, mesure reproduite sans React donc imputable à la transition elle-même) : elle anime quatre propriétés qui reposent la disposition à chaque trame, et l'allègement vise **une seule** propriété de disposition par trame, `left` sur `.add-cue`, conservée parce que son motif est écrit dans le code et parce que `position: absolute` confine la reprise à son sous-arbre. Le changement est un allègement, pas une refonte, et il est jugé par la remesure au même protocole plutôt que par la théorie — le clignotement d'arrivée en `box-shadow`, que la théorie condamnait et qui ne perd aucune trame, est le rappel que ce lot mesure au lieu de supposer. Enfin, une limite de vérification doit être portée au dossier : l'outil d'émulation disponible ne couvre pas `prefers-reduced-motion`, donc cette session peut prouver les déclarations, pas le rendu effectif sous la préférence.

## Impacts UX

Activer « réduire les animations » n'est pas un réglage de goût : c'est ce que fait quelqu'un dont l'oreille interne traduit un glissement à l'écran en vertige réel, quelqu'un chez qui un clignotement déclenche une migraine, ou quelqu'un dont l'attention part à chaque chose qui bouge dans le champ. Ces trois personnes ont en commun d'avoir **déjà dit ce qu'elles voulaient**, une fois, au niveau du système — et de s'attendre à ce que l'application s'y tienne partout. Or Penduline n'en honorait qu'un tiers, au cas par cas, bloc par bloc. Cette couverture partielle est **presque pire qu'aucune couverture** : sans elle, on sait à quoi s'en tenir et on se prépare ; avec elle, on se détend — les feuilles ne glissent plus, le toast ne monte plus — puis un écran entier se déplie en `mm-in`, une case grossit à la coche, la corbeille arrive en transition de vue. Le mouvement inattendu est exactement celui qui coûte le plus cher : c'est celui qu'on n'a pas pu anticiper. D'où la décision de passer d'une liste d'exceptions à une **règle globale** — la méthode au cas par cas est précisément ce qui a produit le trou, et la prochaine animation ajoutée serait de nouveau oubliée.

```
prefers-reduced-motion — AVANT            APRÈS
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ ✓ feuille   ✓ toast          │          │ ✓ tout ce qui a une durée    │
│ ✓ nid       ✓ « ＋ ajouter » │          │   (règle globale, *)         │
│ ✓ flash     ✓ chevron        │          │ ✓ + les 8 blocs d'ÉTAT       │
│ ✓ ligne neuve  ✓ balayage    │          │   conservés au-dessus        │
│ ──────────────────────────── │          │ ✓ + l'API View Transitions   │
│ ✗ mm-in × 9  (5 écrans…)     │   ───▶   │   court-circuitée en JS      │
│ ✗ mm-pop, mm-check           │          │                              │
│ ✗ transitions de vue         │          │  rien ne bouge, nulle part   │
│ ✗ ~25 transitions            │          │                              │
└──────────────────────────────┘          └──────────────────────────────┘
      « ça dépend » = impossible à anticiper
```

La règle globale supprime des **durées** ; les huit blocs existants, eux, préservent des **états** — et c'est pourquoi ils restent au-dessus d'elle plutôt que d'être remplacés par un plancher uniforme. Une animation qui porte une information ne doit pas disparaître, elle doit se poser : le clignotement qui signale la tâche qu'on vient de rejoindre devient un **liseré fixe** autour de la carte, toujours là pour dire « c'est celle-ci » ; le nid de chargement s'arrête, mais **droit**, à `rotate: 0deg`, et non figé de travers à l'angle où la trame s'est interrompue — un pendule arrêté en biais se lit comme un défaut d'affichage, pas comme un chargement, et le libellé « ça charge » continue de tenir son rôle sans bouger. C'est aussi la raison du `0.01ms` plutôt que `none` dans la règle globale : une durée quasi nulle laisse les états finaux et les `animation-fill-mode` s'appliquer, là où couper l'animation ferait retomber des éléments sur leur état de départ.

```
.task--flash          mouvement                      réduit
                 ┌───────────────┐              ┏━━━━━━━━━━━━━━━┓  ← liseré
                 │ Relire le CR  │  ◌ ◌ ◌       ┃ Relire le CR  ┃    accent,
                 └───────────────┘  clignote    ┗━━━━━━━━━━━━━━━┛    permanent

.loader             mouvement            réduit ✗ (figé)    réduit ✓
                       ╱                      ╲                 │
                     (◠)  balance            (◠) de travers    (◠) droit
                   « ça charge… »          « c'est cassé ? »  « ça charge… »
```

Pour tout le monde n'ayant pas activé la préférence — la quasi-totalité des usages — **ce lot ne se voit pas**, et c'est le résultat attendu. La mesure sous bridage CPU 4× a désigné une seule animation coupable sur cinq : l'ouverture du champ « ＋ ajouter », une pire trame à 58 ms, soit **une** trame perdue, au tout début d'un geste qu'on ne fait pas dix fois par heure. Le retour d'aiguille est plus intéressant que le défaut lui-même : le clignotement d'arrivée, qu'on s'attendait à condamner parce qu'il anime `box-shadow`, ne perd rien du tout — c'est le bénéfice d'avoir mesuré plutôt que supposé, et cela évite de casser une animation qui va bien. Le correctif reste donc chirurgical : le repère « ＋ ajouter » passe de quatre propriétés qui reposent la disposition à chaque trame à une seule, sans que le geste change d'allure à l'œil (le rembourrage et le décalage de 5 px sautent, mais ils sont masqués par le repère pendant tout le mouvement). Personne ne devrait remarquer la différence autrement qu'en ne sentant plus l'accroc initial.

```
« ＋ ajouter » — au toucher du champ
  repos                        saisie
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      ┌─────────────────────┐
│     ＋ ajouter       │  ▶   │ Appeler le notaire ＋│
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘      └─────────────────────┘
   anime AVANT : left + padding-right + max-width + margin-left  → 58 ms
   anime APRÈS : left (+ max-width/opacity du mot, dans le sous-arbre
                 absolu de `.add-cue`)                           → cible < 33 ms
```
