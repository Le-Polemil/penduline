---
slug: "annulation"
title: "Annuler ses gestes (#46)"
issues: [46]
pr: 85
created: 2026-08-29
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `data/undo.ts` : la pile et ses règles, avec tests | Terminé | 2026-08-29 |
| 2. `store.ts` : `group`, `undo`, `redo`, `clearUndo` | Terminé | 2026-08-29 |
| 3. Les écrans : `apply` prend un libellé | Terminé | 2026-08-29 |
| 4. `data/useUndoShortcut.ts` : le raccourci et son toast | Terminé | 2026-08-29 |
| 5. Vérifications automatiques | Terminé | 2026-08-29 |
| 6. Validation en navigateur (10 points) | Terminé | 2026-08-29 |
| 7. Commit, push et PR fermant #46 | Terminé | 2026-08-29 |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-08-29 : la pile, le groupement, le raccourci

**Statut** : Terminé

**Actions réalisées** :
- `data/undo.ts` + `undo.test.ts` : la pile, son plafond, ses deux sens. 5 tests.
- `store.ts` : `group(label, fn)`, `undo`, `redo`, `clearUndo`, `undoLabel` /
  `redoLabel`. `patchTask` retient son inverse **après succès**.
- Les écrans : `apply(label, writes)`, et un libellé par geste.
- `data/useUndoShortcut.ts` : `Ctrl+Z` / `Cmd+Z`, `Maj` pour rétablir, inerte dans
  un champ.
- `App.tsx` : branchement, et vidage de la pile au changement d'écran.

**Fichiers modifiés** :
- `apps/web/src/data/undo.ts`, `undo.test.ts`, `useUndoShortcut.ts` *(nouveaux)*
- `apps/web/src/data/store.ts`, `App.tsx`, `screens/Matrix.tsx`, `screens/Global.tsx`

**Notes** :

**La moitié du travail existait déjà.** `persist` capturait l'état d'avant de
chaque écriture pour pouvoir la défaire en cas d'échec (#34), et
`previousValues` calculait le patch inverse. L'annulation était écrite ; elle ne
servait simplement qu'en cas de panne. Et les six gestes du ticket sont tous des
patchs — l'inverse d'un patch est un patch, il n'y avait pas de second mécanisme
à inventer.

**🐛 Le défaut qui a tout fait rater au premier essai.** `patchTask` lisait
`collecte.current` **au moment où son écriture se résout** — or `group` referme
son collecteur dès que `fn` a rendu la main, c'est-à-dire bien avant. Le
collecteur était donc toujours `null`, aucun inverse n'était retenu, et `Ctrl+Z`
**affichait son toast sans rien défaire**.

Le symptôme est méchant : tout *semblait* marcher. Corrigé en capturant le
collecteur de façon synchrone, à l'entrée de `patchTask`.

**🐛 Le renommage échappait au dispositif.** `commitTaskRename` appelait
`patchTask` directement, hors de tout groupe : même symptôme, toast sans effet.
Passé par `group`. Les autres appels directs — restauration depuis la corbeille,
complétion — restent dehors **à dessein** : la complétion a déjà son propre toast
de quatre secondes, et le ticket ne la liste pas.

**On n'empile qu'en cas de succès.** Si l'écriture échoue, `persist` a déjà remis
l'état d'avant : empiler ferait défaire un geste qui n'a jamais eu lieu, soit
exactement le « troisième état » que le ticket redoutait.

### 2026-08-29 : validation en navigateur

**Statut** : Terminé — console sans erreur.

| Contrôle | Résultat |
|---|---|
| Déplacer une **paire**, `Ctrl+Z` | les **deux** cartes reviennent, d'un seul coup |
| `Ctrl+Maj+Z` | les deux repartent |
| La paire reste appairée tout du long | ✅ |
| Supprimer, `Ctrl+Z` | la tâche revient |
| Renommer, `Ctrl+Z` | l'ancien titre revient |
| Toast | « Annulé : Déplacée vers « Déléguer » » — le geste, pas l'objet |
| `Ctrl+Z` **dans un champ** | la saisie est intacte, aucun geste défait |
| Après **changement d'écran** | la pile est vide, `Ctrl+Z` ne fait rien |

`npm test` : 100 partagés + 26 web · `typecheck` ✅ · `build` ✅
