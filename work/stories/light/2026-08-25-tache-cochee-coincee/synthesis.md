---
slug: "tache-cochee-coincee"
title: "La tâche cochée qui ne part jamais (#75)"
issues: [75]
pr: 81
created: 2026-08-25
completed: 2026-08-25
status: "Done"
---

# Synthèse

## Résumé

Cocher une tâche n'écrit plus qu'**une fois**, à l'état final. Le délai
d'annulation de quatre secondes vit désormais en mémoire, et non plus dans le
modèle de données.

Dernier défaut visible du jalon « Vague 0 — Avant ouverture ».

## Le défaut

Cocher écrivait `done` tout de suite, `archived` quatre secondes plus tard — et
le `setTimeout` qui portait la seconde écriture ne survivait pas au démontage de
l'écran. Revenir à l'accueil ou recharger dans ce délai laissait `done: true`
sans `archived`, que la règle d'affichage montrait **pour toujours**. Aucun geste
ne permettait de s'en débarrasser : recocher ne faisait que décocher.

## Décisions et leur raison

**La correction retire au minuteur sa responsabilité, elle ne le sauve pas.**
Persister l'échéance, la rejouer au chargement, écrire une passe de rattrapage :
autant de réponses au mauvais problème. Un minuteur qui ne fait plus qu'oublier
un état local peut mourir n'importe quand.

**`isVisible` masque sur `done` seul.** La ligne « coincée » disparaît du tableau
des états : plus aucune combinaison de drapeaux ne peut afficher une tâche cochée
à demeure. La correction est **par construction, pas par réparation** — les
données déjà abîmées sortent de la grille au premier rendu, sans migration ni
écriture au chargement. Et le web rejoint l'extension, qui filtrait déjà
`!t.done` : une donnée, une règle.

**Contrepartie non optionnelle : la corbeille liste `done && !deleted`.**
`archived` cessant d'être le critère d'affichage, il ne pouvait pas rester celui
de la récupération. Sans ce second changement, une tâche coincée sortait de la
grille sans entrer dans « Terminées » — invisible *et* irrécupérable, pire que le
défaut corrigé.

**`pending` ne va qu'aux trois points de rendu.** Les autres appels de
`visibleTasks` calculent des positions d'insertion : une tâche en partance n'a pas
à servir de repère à un voisin qu'elle va quitter.

## Ce que le travail a mis au jour

**⚠️ Le vrai piège était l'appairage, et le ticket ne le voyait pas.**
`planPairDetach` dissocie la paire au moment de l'archivage. Le rendre immédiat
rend la dissociation immédiate, et déplace l'annulation **du mauvais côté du
détachement**. Un `undo` naïf aurait laissé les deux `pair_id` à `null` : deux
cartes toujours visibles, un lien mort. Exactement l'invariant que #51 et #60 ont
coûté cher à établir — et une rupture qu'aucun test d'affichage n'attrape.

`pending` porte donc, en plus de quoi afficher la tâche, **de quoi défaire
l'écriture** : la tâche, sa partenaire, et le lien.

**Le test encodait le bug comme une décision produit.** La ligne du tableau
d'états disait `visible: true` avec ce commentaire : *« Décision produit : une
tâche cochée reste VISIBLE tant qu'elle n'est pas archivée — c'est le délai
d'annulation de 4 s. »*

Le défaut, écrit noir sur blanc et transformé en intention. Le test était fidèle
au code, et c'est ce qui l'a rendu invisible : **personne ne relit une ligne
accompagnée de sa justification.** Renversée, avec la raison du renversement.

**Une ligne manquait au tableau** : « épinglée et cochée ». Le masquage devait
valoir aussi dans la zone des épinglées, sans quoi cocher une épinglée l'aurait
fait disparaître sans délai d'annulation.

## Fichiers modifiés

- `packages/shared/src/layout.ts` + `.test.ts` — la règle et son exception
- `apps/web/src/data/useCompletion.ts` — écriture unique, `pending`, `undo` complet
- `apps/web/src/screens/Matrix.tsx`, `Global.tsx` — rendu et corbeille

Aucune migration. `apps/extension` n'est pas touchée : elle avait déjà raison.

## Tests et validation

- **Tests automatiques** : ✅ **94** partagés + 13 web · **Typecheck / build** : ✅ · **CI** : ✅
- Les quatre tests écrits **avant** l'implémentation échouaient bien sur le code
  d'origine.
- **En navigateur**, base locale, console sans erreur :

| Point | Résultat |
|---|---|
| Tâche coincée fabriquée à la main | **absente de la grille** |
| La même dans « Terminées » | **présente**, « Rétablir » la remet en place |
| Cocher puis **recharger dans les 4 s** | base à `done = t, archived = t` — rangée |
| Pendant le délai | affichée, barrée, toast « Annuler » |
| **Annuler une tâche appairée** | `pair_id` **rétabli des deux côtés en base** |

Le dernier point ne se vérifie qu'en interrogeant la base : à l'écran, une paire
morte ressemble à une paire vivante.

## Et après

La Vague 0 n'a plus que **#35** — le suivi des erreurs. #77 a rendu les échecs
visibles à l'utilisateur ; celui-là les rendra visibles au mainteneur, qui ne sait
rien de ce qui casse chez les autres.
