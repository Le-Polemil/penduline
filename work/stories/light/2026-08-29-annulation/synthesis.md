---
slug: "annulation"
title: "Annuler ses gestes (#46)"
issues: [46]
pr: 85
created: 2026-08-29
completed: 2026-08-29
status: "Done"
---

# Synthèse

## Résumé

`Ctrl+Z` défait le dernier geste, `Ctrl+Maj+Z` le rétablit. Déplacement,
réordonnancement, épinglage, suppression, renommage, changement de matrice.

## La moitié du travail existait déjà

`persist` capturait l'état d'avant de chaque écriture pour la défaire en cas
d'échec (#34), et `previousValues` calculait le patch inverse. L'annulation était
écrite ; elle ne servait qu'en cas de panne.

Et les six gestes listés **sont tous des patchs** — l'inverse d'un patch est un
patch. Il n'y avait pas de second mécanisme à inventer, seulement à rendre
disponible sur demande ce qui existait pour les urgences.

## Décisions et leur raison

**Les écritures se groupent.** Déplacer une paire en produit deux ; les empiler
séparément ferait annuler une moitié de paire.

**On n'empile qu'en cas de succès.** Sinon `Ctrl+Z` défairait un geste qui n'a
jamais eu lieu — le « troisième état » que le ticket redoutait.

**Le raccourci est inerte dans un champ.** `Ctrl+Z` y appartient au navigateur ;
le détourner ferait perdre une frappe au lieu de défaire un geste.

**La pile se vide au changement d'écran et à la reconnexion.** Annuler dans un
contexte devenu faux est pire que ne pas pouvoir annuler.

## Ce que le travail a mis au jour

**🐛 Le collecteur était lu trop tard, et tout semblait pourtant marcher.**
`patchTask` lisait `collecte.current` au moment où son écriture **se résout** — or
`group` le referme dès que `fn` a rendu la main, bien avant. Il était donc toujours
nul, aucun inverse n'était retenu, et **`Ctrl+Z` affichait son toast sans rien
défaire**.

Le symptôme est le pire qui soit : le raccourci répondait, le libellé était juste,
le toast s'affichait. Seule la vérification de l'état réel, case par case, l'a
révélé. Corrigé en capturant le collecteur de façon synchrone à l'entrée.

**🐛 Le renommage échappait au dispositif**, appelant `patchTask` hors de tout
groupe — même symptôme. La complétion reste dehors **à dessein** : elle a déjà son
toast de quatre secondes.

## Fichiers modifiés

- `apps/web/src/data/undo.ts`, `undo.test.ts`, `useUndoShortcut.ts` *(nouveaux)*
- `apps/web/src/data/store.ts`, `App.tsx`, `screens/Matrix.tsx`, `screens/Global.tsx`

Aucune migration.

## Tests et validation

- **Automatiques** : ✅ 100 partagés + 26 web · typecheck ✅ · build ✅ · CI ✅
- **En navigateur**, console sans erreur : une paire se défait d'un seul `Ctrl+Z`
  et se rétablit sans se rompre ; suppression et renommage s'annulent ; le toast
  nomme le geste ; le raccourci est inerte dans un champ ; la pile est vide après
  un changement d'écran

## Et après

**Annuler une création** reste dehors : l'inverse d'un INSERT est une suppression
définitive, bien plus lourde que le geste défait.

**La réconciliation avec le temps réel** aussi : une entrée peut viser une tâche
qu'un autre appareil a modifiée depuis. La pile étant vidée à la reconnexion, la
fenêtre est étroite — et le ticket avait tranché.
