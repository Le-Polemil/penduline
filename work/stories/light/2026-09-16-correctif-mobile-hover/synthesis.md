---
story: "Correctif Mobile 2/3 — les états de survol"
story_code: "correctif-mobile-hover"
created: 2026-09-16
completed: 2026-09-16
status: "Done"
---

# Synthèse

## Résumé

Deuxième des trois passes mobile (#90) : une seule cause, beaucoup de symptômes.
Sur un écran tactile, `:hover` se **colle** — un tap le déclenche et l'élément le
garde jusqu'au tap suivant ailleurs. La feuille comptait 57 règles de survol,
**aucune** conditionnée à un pointeur précis.

## Changements réalisés

- **~45 règles `:hover` sous `@media (hover: hover) and (pointer: fine)`**,
  enveloppées **en place** pour ne rompre ni le couplage règle/commentaire ni
  l'ordre de cascade.
- **Neuf règles scindées** : elles mêlaient `:hover` et `:focus-visible` /
  `:focus-within` / `[aria-expanded]` dans une même déclaration.
- **Les deux croix sans porte tactile** — détacher un lien, supprimer une étape —
  passent à `opacity: 0.55` sous `(pointer: coarse)`.
- **`usePointeurFin()`** ajouté à `data/useBalayage.ts`, et le sous-menu d'univers
  ne monte ses gestionnaires de souris que sur pointeur fin.
- **`Alt+↑ / Alt+↓` masqués** dans le menu sous `(hover: none)`.
- **Un bloc `@media (hover: none)` supprimé** : il neutralisait le survol des
  actions d'univers, ce que la garde fait désormais en amont.

## Décisions structurantes

**Le troisième axe.** #89 avait posé la largeur (géométrie) et `pointer: coarse`
(ergonomie) ; celui-ci ajoute `hover: hover` + fin (affordances). L'iPad prouve à
lui seul qu'ils ne se recouvrent pas : large, grossier, sans survol.

**La frontière survol / focus.** `:focus-visible` et `:focus-within` ressemblent
syntaxiquement au survol et cohabitent avec lui dans les mêmes sélecteurs, mais ce
sont eux qui portent le chemin clavier rendu par #38. Les enfermer dans la garde
aurait cassé l'accessibilité en réparant le tactile.

**Envelopper en place plutôt que regrouper.** `styles.css` est organisé par
composant et chaque règle porte son commentaire d'intention. Regrouper les
conditionnées en fin de fichier les aurait séparées de leur justification, et
aurait déplacé quarante-cinq règles d'un coup dans l'ordre de cascade — où
plusieurs ne tiennent que par leur position.

## Fichiers modifiés

- `apps/web/src/styles.css` — l'essentiel du lot
- `apps/web/src/data/useBalayage.ts` — `usePointeurFin()`, `useRequeteMedia()`
- `apps/web/src/components/TaskCard.tsx` — montage conditionnel du sous-menu

## Tests et validation

- **Linting** : ⚪ le projet n'en a pas (CI = `typecheck` + `test` + `build`)
- **Tests automatiques** : ✅ 233 + 34
- **Typecheck / build** : ✅
- **Relecture A/B** : ✅ doigt / souris / clavier — voir le tableau de `dev.md`
- **Validation manuelle** : ⏳ en attente

## Notes

- **Une mesure à ne pas mal lire.** `document.querySelectorAll(':hover')` renvoie
  toujours treize éléments après un tap : l'état existe encore, on ne peut pas en
  priver le navigateur. Ce qui change, c'est qu'il ne **peint** plus rien. Le
  correctif se mesure aux propriétés calculées, pas au compte des survolés.
- **Un piège de mesure.** Lire `getComputedStyle` dans le même tick qu'un `focus()`
  programmatique renvoie la valeur d'avant. Le premier relevé du chemin clavier
  annonçait une régression qui n'existait pas.
- **`useBalayage.ts` ne porte plus son nom.** Il héberge maintenant trois hooks de
  requête média en plus du geste. À renommer le jour où un quatrième s'y ajoute.
- **Le risque résiduel est desktop.** Aucun test automatisé du dépôt ne couvre
  l'état de survol : la relecture à la souris reste le seul filet.
