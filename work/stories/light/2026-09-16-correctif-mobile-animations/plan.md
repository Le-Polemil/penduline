---
story: "Correctif Mobile 3/3 — les animations"
story_code: "correctif-mobile-animations"
created: 2026-09-16
status: "Done"
---

# #91 — Correctif Mobile 3/3 : les animations

## Contexte

Troisième et dernier lot de la passe mobile. Les animations et transitions ont été
calibrées pour un pointeur et un GPU de bureau ; le ticket demande de les rejouer
en mobile, de **mesurer** celles qui saccadent plutôt que de le supposer, de passer
en `transform` / `opacity` où c'est possible, et de vérifier `prefers-reduced-motion`
pour de bon.

#89 a corrigé la géométrie, #90 les états de survol. Ces deux lots ont d'ailleurs
déjà retiré du mobile une partie des animations en cause : les interstices de
dépôt (`height`) et les zones d'actions (`max-width`) ne se déclenchent plus qu'au
glisser et au survol, donc plus jamais au doigt.

## Inventaire constaté

### A — Ce qui saccade réellement, mesuré

Protocole : émulation 390 × 844 tactile, **bridage CPU 4×**, mesure des intervalles
entre trames (`requestAnimationFrame`) pendant chaque animation. Le seuil de trame
perdue est fixé à 33 ms (deux trames à 60 Hz) ; la médiane observée est de 8,4 ms.

| Animation | Pire trame | Trames perdues |
|---|---|---|
| **Ouverture de « ＋ ajouter »** | **58,4 ms** | **1** |
| Fermeture de « ＋ ajouter » | 9,3 ms | 0 |
| Menu `⋯` (`mm-pop`) | 9,3 ms | 0 |
| Clignotement d'arrivée (`box-shadow`) | 9,3 ms | 0 |
| Balayage de carte (`transform`) | — | 0 |

Deux enseignements, dont un contre-intuitif :

1. **L'ouverture du champ « ＋ ajouter » est la seule qui saccate**, et la mesure
   tient même en basculant la classe à la main, sans React : ce n'est pas un
   re-rendu, c'est la transition. Elle anime **quatre** propriétés qui reposent la
   disposition à chaque trame — `left` (`.add-cue`), `padding-right`
   (`.add-input`), `max-width` et `margin-left` (`.add-word`).
2. **Le clignotement d'arrivée ne saccate pas**, alors que `box-shadow` n'est pas
   une propriété composée et que la théorie le condamnait. 1,6 s × 2 itérations,
   pire trame à 9,3 ms. C'est exactement ce que le ticket demandait de vérifier au
   lieu de le supposer.

### B — `prefers-reduced-motion` n'est honoré qu'à un tiers

Huit blocs le traitent au cas par cas — `.sheet`, `.board-row--fresh`, `.toast`,
les champs `.add-*`, le nid de chargement, `.uni-head__chev`, `.task--flash`, et
`.task-swipe` ajouté par #89. Tout le reste l'ignore :

| Ignoré | Détail |
|---|---|
| `mm-in` | **9 usages** — les 5 conteneurs d'écran, `.task`, `.sub__list`, `.task-menu__flyout` |
| `mm-pop` | `.task-menu`, `.board-menu` |
| `mm-check` | la case qui grossit à la coche |
| `::view-transition-group(*)` | toutes les transitions de vue, 0,28 s |
| ~25 transitions | `.task`, `.task__check`, `.board-row`, les trois interstices, `.move-btn`, `.sub__item`, `.quad`, `.att__chip`… |

### C — Une animation morte

`@keyframes mm-pinpulse` est déclarée et **utilisée zéro fois**. C'est un reste de
l'épinglage : le commentaire de `.task--today` dit que la pulsation a été écartée
quand l'engagement du jour a remplacé l'épinglage, mais les images-clés sont
restées.

### D — Le délai d'annulation de 4 s (#75)

Le mécanisme lui-même est sain : depuis #75 le minuteur ne porte plus d'écriture,
il n'oublie qu'un état local. Reste son **rendu** en mobile, à vérifier —
largeur du toast, position au-dessus de la barre gestuelle (corrigée par #89),
taille de la cible « Annuler ».

## Décisions prises

- **Couverture globale de `prefers-reduced-motion`**, plutôt qu'un neuvième bloc
  au cas par cas : c'est précisément la méthode au cas par cas qui a produit le
  trou actuel, et la prochaine animation ajoutée serait de nouveau oubliée.
- **Les huit blocs existants restent.** Un plancher de durée ne fait pas ce qu'ils
  font : eux **préservent un état** — le liseré de `.task--flash` qui remplace le
  clignotement, le `rotate: 0deg` du nid. Une durée nulle laisserait le nid figé
  dans une position arbitraire.
- **`withVT()` court-circuite l'API View Transitions** sous la préférence : la
  règle CSS globale ne touche pas les pseudo-éléments `::view-transition-*`, et
  l'animation de l'API se jouerait quand même.
- **« ＋ ajouter » est allégé, pas refondu.** On retire de la transition ce qui
  n'apporte rien, on garde `left` dont le motif est écrit dans le code.

## Travaux

### 1. Publier l'inventaire sur #91
Reporter l'inventaire ci-dessus dans le corps de l'issue, mesures comprises.

### 2. `prefers-reduced-motion`, couverture globale — `apps/web/src/styles.css`
En **fin de fichier**, après les blocs existants :

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`0.01ms` et non `none` : une durée nulle laisse les `animation-fill-mode` et les
états finaux s'appliquer, là où `animation: none` ferait retomber certains
éléments sur leur état initial. Un commentaire doit dire pourquoi les huit blocs
spécifiques survivent au-dessus — ils portent des **états**, pas des durées.

### 3. Les transitions de vue — `apps/web/src/lib/viewTransition.ts`
`withVT()` appelle `fn()` directement quand
`matchMedia('(prefers-reduced-motion: reduce)').matches`. La branche existe déjà
pour les navigateurs sans `startViewTransition` : il n'y a qu'une condition à
élargir, et le commentaire de tête à compléter.

### 4. Alléger « ＋ ajouter » — `styles.css`
- `.add-input` : retirer `padding-right` de sa transition. Le rembourrage peut
  sauter — il est masqué par le repère pendant tout le mouvement.
- `.add-word` : remplacer `margin-left` par rien (le décalage de -5 px peut être
  immédiat) et garder `max-width` + `opacity`. `.add-cue` étant en
  `position: absolute`, cette reprise de disposition ne sort pas de son sous-arbre.
- `.add-cue` : `left` reste, avec son commentaire d'origine — et une note de
  mesure.

Objectif : une seule propriété reposant la disposition de la page par trame au
lieu de quatre. **À re-mesurer avec le même protocole** : la valeur attendue est
une pire trame nettement sous 33 ms, et c'est ce chiffre qui décide si le
changement valait la peine.

### 5. Supprimer `mm-pinpulse` — `styles.css`
Images-clés mortes.

### 6. Un verrou de non-régression — nouveau `apps/web/src/styles.test.ts`
Sur le modèle de `apps/web/src/pwa/manifest.test.ts`, qui teste déjà un fichier
statique. Trois assertions lisant `styles.css` :

- **toute `@keyframes` déclarée est utilisée** — c'est ce qui aurait attrapé
  `mm-pinpulse` ;
- **le bloc global `prefers-reduced-motion` existe** — sans quoi la couverture
  repartirait au cas par cas sans que personne ne le voie ;
- **aucune règle `:hover` hors de la garde `(hover: hover)`**, sauf `a:hover` —
  ce verrou appartient à #90 mais n'a de valeur que posé, et rien d'autre ne le
  protège.

### 7. Vérifier le délai d'annulation en mobile
Cocher une tâche à 390 px, relever largeur et position du toast, la taille de la
cible « Annuler », et que les 4 s s'écoulent sans que rien ne saute.

## Vérification

**Automatique** — `npm run typecheck`, `npm test` (dont le nouveau
`styles.test.ts`), `npm run build`.

**Mesures, même protocole qu'à l'audit** (390 × 844, tactile, bridage CPU 4×) :

1. Ouverture de « ＋ ajouter » — pire trame **avant / après**, c'est le chiffre qui
   juge la tâche 4.
2. Menu `⋯`, clignotement, balayage — inchangés, aucune trame perdue.

**À la main :**

3. **`prefers-reduced-motion`** — à jouer dans un vrai navigateur, préférence
   activée dans le système : plus aucun mouvement sur les six écrans, le nid de
   chargement immobile mais droit, le liseré de `.task--flash` présent, et
   l'ouverture de la corbeille sans transition de vue.
   ⚠️ L'outil d'émulation disponible ici ne couvre pas cette caractéristique
   média : **ce point ne pourra pas être vérifié dans cette session**, seulement
   les déclarations qui le portent.
4. **Toast d'annulation à 390 px** — cocher une tâche : le toast tient dans la
   largeur, se pose au-dessus de la barre gestuelle, « Annuler » fait 44 px.
5. **1440 × 900** — les animations desktop sont inchangées.

## Hors périmètre

- Les interstices de dépôt (`height`) et les zones d'actions (`max-width`) : ils
  ne se déclenchent qu'au glisser et au survol, donc jamais au doigt depuis #89
  et #90. Mesurés à zéro trame perdue sur desktop.
- Le glisser tactile réel, toujours absent → ticket à ouvrir.
- La case à cocher sans contour sur « Aujourd'hui » et « Revue » → #92.
