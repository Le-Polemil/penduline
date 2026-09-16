---
story: "Correctif Desktop — divers"
story_code: "correctif-desktop-divers"
created: 2026-09-16
completed: 2026-09-16
status: "Done"
---

# Synthèse

## Résumé

Pendant desktop de la passe mobile (#92), et dernier des quatre lots. Deux items
figuraient dans l'issue ; la passe dédiée en a trouvé sept autres. Ce qu'elle a
trouvé se hiérarchise proprement : deux vrais bugs, un trou d'accessibilité, un
geste manquant, et de la finition.

## Changements réalisés

- **La case à cocher retrouve un contour** sur « Aujourd'hui » et « Revue » —
  repli sur les neuf lectures de variables de quadrant évaluables hors `.quad`.
- **`::view-transition-group(bin) { z-index: 100 }`** — les cartes ne recouvrent
  plus le panneau de corbeille pendant son ouverture.
- **`useDialog` confine `Tab`** — une implémentation pour les trois modales.
- **Le lien d'une paire devient un vrai bouton** de dissociation, visible sans
  survol et à 44 px au doigt.
- **Les cartes appairées sont allégées** : plus de poignée (elle mentait), plus de
  raccourcis (ils sont dans le `⋯`), des titres qui se lisent.
- **`Ctrl+Z` inerte derrière une modale**, `cursor: grab` seulement là où la carte
  se déplace, chevron de revue lisible, croix bleue native masquée.
- **Trois cibles à 44 px** que #89 ne pouvait pas mesurer.

## Décisions structurantes

**Une variable CSS manquante emporte le raccourci entier.** `border: 2px solid
var(--q-ink)` ne perd pas une couleur : la déclaration devient invalide au calcul
et la bordure disparaît, style et largeur compris. La règle qui en découle est
écrite dans le code : toute lecture d'une variable de quadrant depuis un composant
qui peut vivre hors `.quad` porte un repli.

**L'empilement d'une transition de vue ne se déduit pas du DOM.** Les éléments
nommés sortent de l'arbre de rendu ; le `z-index` du document n'y ordonne plus
rien. C'est la deuxième fois que ce mécanisme se manifeste dans cette série — #89
avait déjà trouvé un empilement qui ne tenait qu'à un effet de bord de
`view-transition-name`.

**La réversibilité plutôt que la confirmation.** Dissocier une paire ne demande
rien : `unpair` passe par `store.group`, donc `Ctrl+Z` la rétablit. Un dialogue
coûterait un arrêt à chaque geste pour couvrir le geste rare.

## Fichiers modifiés

- `apps/web/src/styles.css` — l'essentiel
- `apps/web/src/a11y/useDialog.ts` — confinement de `Tab`
- `apps/web/src/components/TaskCard.tsx` — prop `paired`, classe de curseur
- `apps/web/src/screens/{Matrix,Global}.tsx` — bouton de dissociation
- `apps/web/src/data/useUndoShortcut.ts` — garde modale

## Tests et validation

- **Linting** : ⚪ le projet n'en a pas (CI = `typecheck` + `test` + `build`)
- **Tests automatiques** : ✅ 233 + 37
- **Typecheck / build** : ✅
- **Relecture A/B** : ✅ souris, clavier, doigt — voir le tableau de `dev.md`
- **Validation manuelle** : ⏳ en attente

## Notes

- **Deux mesures m'ont trompé, et il faut le savoir pour la prochaine fois.**
  `getAnimations()` à 0 ne veut pas dire « pas de transition » mais « transition
  finie », et j'ai capturé deux fois après la fin en croyant être au milieu. Et
  `getComputedStyle` sur un pseudo-élément du DOM fantôme de l'agent utilisateur
  (`::-webkit-search-cancel-button`) ne reflète pas ce qui est peint : il annonce
  `display: block` alors que la croix a bien disparu. Dans les deux cas, c'est un
  A/B ou une capture qui a tranché, pas la mesure directe.
- **Le découpage en quatre lots a produit un effet qu'on n'avait pas prévu** :
  trois cibles tactiles étaient invisibles au moment de #89, donc non mesurables ;
  #90 les a rendues visibles, et elles sont devenues mesurables. Chaque passe rend
  la suivante capable de voir ce qu'elle ne voyait pas.
- **Deux tickets à ouvrir** : le glisser tactile réel, toujours absent ; et le menu
  `⋯` devenu haut au doigt (705 px depuis #89), qui gagnerait à devenir une feuille
  par le bas.
