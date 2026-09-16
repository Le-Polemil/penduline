---
story: "Correctif Mobile 3/3 — les animations"
story_code: "correctif-mobile-animations"
created: 2026-09-16
completed: 2026-09-16
status: "Done"
---

# Synthèse

## Résumé

Dernier des trois lots de la passe mobile (#91). Le ticket demandait deux choses :
**mesurer** ce qui saccade au lieu de le supposer, et honorer `prefers-reduced-motion`
pour de bon. La mesure a répondu **rien** ; la préférence, **un tiers**. Le lot est
donc un lot d'accessibilité, pas de fluidité.

## Changements réalisés

- **Un plancher global pour `prefers-reduced-motion`** en fin de feuille, à la place
  d'une neuvième exception au cas par cas. Les huit blocs existants restent au-dessus :
  eux préservent un **état**, le plancher ne supprime qu'une **durée**.
- **`withVT()` court-circuite l'API View Transitions** sous la préférence — le CSS ne
  peut pas atteindre les pseudo-éléments `::view-transition-*`.
- **`@keyframes mm-pinpulse` supprimées**, déclarées et utilisées zéro fois.
- **`styles.test.ts`**, qui verrouille trois conventions jusqu'ici confiées à des
  commentaires.
- **Rien sur « ＋ ajouter »** — voir ci-dessous.

## La tâche annulée

L'audit désignait l'ouverture de « ＋ ajouter » comme la seule animation qui saccate
(58,4 ms sur sa première trame, bridage CPU 4×) et l'attribuait aux quatre propriétés
de disposition animées ensemble. L'allègement a été écrit, puis **annulé** : la
remesure montre que ces 58 ms sont un coût de **premier passage** (9,1 ms dès la
deuxième ouverture), et un A/B exact — cinq passes de chaque côté, dans les deux
ordres — donne **9,3 ms avec ou sans** les propriétés retirées.

Le ticket demande de mesurer plutôt que de supposer ; cela vaut aussi pour le
correctif. Une note de mesure remplace le changement dans le code, et l'inventaire
publié sur l'issue a été corrigé dans une section dédiée plutôt qu'en réécrivant
l'historique — le raisonnement erroné a de la valeur pour qui le referait.

## Fichiers modifiés

- `apps/web/src/styles.css` — plancher, images-clés mortes, note de mesure
- `apps/web/src/lib/viewTransition.ts` — garde `mouvementReduit()`
- `apps/web/src/styles.test.ts` *(nouveau)* — trois verrous
- `apps/web/src/vite-env-node.d.ts` *(nouveau)* — deux signatures minimales

## Tests et validation

- **Linting** : ⚪ le projet n'en a pas (CI = `typecheck` + `test` + `build`)
- **Tests automatiques** : ✅ 233 + 37, dont 3 nouveaux
- **Typecheck / build** : ✅
- **Mesures** : ✅ aucune animation ne perd de trame au régime établi
- **Validation manuelle** : ⏳ en attente

## Notes

- **`prefers-reduced-motion` n'a pas été exercé.** L'outil d'émulation ne couvre pas
  cette caractéristique média. Prouvé : les 9 blocs sont dans le CSSOM, le plancher
  est parsé, ses déclarations portent `!important`, la garde JS est en place. **Reste
  à constater** dans un vrai navigateur, préférence activée.
- **`?raw` ne fonctionne pas sur un `.css`** — le greffon CSS de Vite revendique
  l'extension avant la requête, et l'import renvoie une chaîne vide. À retenir : le
  patron de `pwa/manifest.test.ts` ne se transpose pas tel quel.
- **Un verrou non éprouvé ne verrouille rien** : les trois assertions ont été vues
  échouer avant d'être acceptées.
- **Ce qui reste ouvert** : le glisser tactile réel, toujours absent — déplacer une
  tâche au doigt passe par le menu `⋯`. Remplacer le glisser HTML5 par du Pointer
  Events est une refonte des deux écrans et des interstices, donc un ticket à lui
  seul, à ouvrir.
