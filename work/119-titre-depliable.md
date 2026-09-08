# #119 — Lire un titre de tâche coupé

## Le problème

`.task__title` portait `white-space: nowrap` + `text-overflow: ellipsis` dans les
**deux** applications, et **rien** ne permettait de lire la suite : ni infobulle,
ni dépliage, ni retour à la ligne. Un titre coupé n'est pas seulement inélégant,
il est **inutile** — c'est le contenu principal de la carte.

Pire dans le panneau, que Chrome laisse réduire à ~240 px.

## Les décisions

### Déplier au clic, plutôt que revenir à la ligne

Le retour à la ligne systématique ferait varier la hauteur de **toutes** les
cartes pour un cas minoritaire, alors que la grande majorité des titres tiennent
sur une ligne. Le dépliage garde la grille compacte et ne coûte qu'un geste, sur
les seules cartes concernées.

Écarté aussi : l'infobulle **seule**. Elle ne marche pas au doigt, et elle
n'affiche rien de sélectionnable. Elle est conservée comme *second* chemin, pas
comme réponse.

### ⚠️ Les écouteurs sont posés en NATIF sur la carte, pas en props React

C'est le choix non évident du ticket, et il a une raison précise.

Le clic doit déplier depuis **toute la carte**, or le titre n'est qu'un de ses
enfants. Deux voies s'offraient :

1. **props React sur la carte** (`onClick`, `onPointerDown`, `onDragStart`) —
   c'est ce que j'avais écrit d'abord. Mais le panneau d'extension rend ses cartes
   **dans une boucle** (`list.map`), où aucun hook ne peut vivre : il aurait fallu
   extraire la carte en composant, soit ~157 lignes de JSX et une interface d'une
   vingtaine de props, pour une fonctionnalité d'affichage ;
2. **le hook s'attache lui-même** à son ancêtre `.task` (`closest('.task')` +
   `addEventListener`). Retenu. Un composant de titre de quinze lignes suffit
   alors côté panneau, et les **deux hôtes partagent exactement le même hook**.

Le couplage à la classe `.task` est réel mais superficiel, et il est assumé : elle
existe dans les deux feuilles de style et n'est pas près de changer de nom.

### L'option `doubleClic`

Seule divergence de comportement entre les deux hôtes, et elle est portée par un
paramètre plutôt que par deux implémentations :

- **web** : le double-clic renomme, et partage son premier clic avec le dépliage →
  minuteur de 220 ms que le `dblclick` désarme ;
- **panneau** : le renommage passe par le menu `⋯` → rien à désambiguïser, donc
  dépliage immédiat. Y garder 220 ms serait une lenteur payée pour rien.

⚠️ **Si le point 3 de #95 est livré** (double-clic = renommer dans le panneau),
cette option doit repasser à `true` — sinon les deux gestes se déclencheront
ensemble.

### La troncature est MESURÉE, pas devinée

`ResizeObserver` sur le titre, et non un simple effet sur le texte : la même
phrase tient sur une ligne dans une grille large et déborde dans une colonne
étroite. L'utilisateur redimensionne sa fenêtre — et son panneau.

⚠️ `deplie` est **volontairement absent** des dépendances de la mesure : déplié,
l'élément n'est plus tronqué par construction, et re-mesurer ferait retomber
`tronque` à faux — donc disparaître le curseur au moment même du clic.

## Gotchas

**Le doublon du hook est assumé.** `apps/web/src/data/useTitreDepliable.ts` et
`apps/extension/src/useTitreDepliable.ts` sont identiques à leur préambule près et
doivent le rester. Le partager supposerait de faire entrer React dans
`@penduline/shared`, qui est de la logique pure ; et il n'y a ici **aucune logique
pure à extraire** — tout est mesure du DOM et désambiguïsation d'événements. Même
arbitrage que `Icons.tsx` ; c'est #79 qui tranchera la forme d'un paquet de
composants partagés.

**`overflow-wrap: anywhere` n'est pas décoratif.** Sans lui, un mot plus large que
la colonne — une URL collée, un nom de fichier — sortirait de la carte une fois
déplié.

**`align-items: flex-start` sur la carte dépliée**, via `:has()`. Sans ça, la case
à cocher flotte au milieu d'un pavé de six lignes, loin du début du texte qu'elle
concerne.

**Fausse alerte de développement à connaître.** Modifier ce hook pendant que la
page tourne déclenche « *React has detected a change in the order of Hooks* » puis
« *Rendered fewer hooks than expected* », et la page devient blanche. C'est un
artefact du rechargement à chaud — le nombre de hooks du fichier a changé — et non
un bug. Un rechargement complet suffit ; vérifié sur page neuve.

## Vérification

Mesurée au DOM contre le Supabase local, dans les deux hôtes (panneau émulé à
280 px) :

| Propriété | Résultat |
|---|---|
| Seul un titre réellement coupé porte `--tronque`, l'infobulle et `zoom-in` | ✅ |
| Clic → déplié (web 17→68 px ; panneau 15→90 px), texte entier, rien ne déborde | ✅ |
| Second clic → replié, infobulle revenue | ✅ |
| Titre court : carte inchangée au clic | ✅ |
| Glisser **abandonné** puis clic → pas de dépliage | ✅ |
| Double-clic (web) → renommage ouvert, sans dépliage | ✅ |
| Panneau : déplié en moins de 60 ms (donc sans minuteur) | ✅ |
| Contrôles réalignés en haut (`align-items: flex-start`) | ✅ |
