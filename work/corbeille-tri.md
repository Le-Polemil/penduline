# Corbeille : le tri, et la colonne qu'il a fallu ajouter

**Symptôme.** La corbeille paraissait triée par date de création. En réalité elle
n'était **triée par rien** : `Matrix.tsx` et `Global.tsx` ne faisaient qu'un
`filter`, `BinModal` aucun tri. L'ordre affiché était celui du chargement, donc
`position` — qui vaut `max + 1` à la création, d'où la ressemblance.

## La décision : `completed_at`, contre l'avis de #48

`20260901140000_stats.sql` refusait explicitement cette colonne, avec un bon
argument : depuis #75 cocher est **une seule écriture**, donc pour une tâche
`done` jamais retouchée, `updated_at` EST l'instant de complétion.

Ce qui a fait tomber l'argument, c'est « jamais retouchée ». Renommer une tâche
déjà rangée écrit `updated_at` et la ferait remonter en tête d'une liste qui
prétend classer par cochage. C'est mot pour mot le raisonnement qui a produit
`quadrant_changed_at` en #47, appliqué cette fois à la complétion.

Trois colonnes, trois questions, aucune redondance :

| Colonne | Question |
|---|---|
| `updated_at` | dernière modification, quelle qu'elle soit |
| `quadrant_changed_at` (#47) | dernier changement de case |
| `completed_at` | moment où la tâche a quitté la grille |

Tenue par trigger sur `update of done` : la règle vaut pour l'app web, le popup
**et** le serveur MCP (#23) sans exister en trois copies. Décocher la remet à
`null`. Elle est absente de `TaskPatch` — aucun client ne l'écrit.

## ⚠️ Le piège du rattrapage, et sa contre-épreuve

`tasks_updated_at` se déclenche sur **tout** update, sans liste de colonnes.
Le rattrapage `set completed_at = updated_at where done` copie bien l'ancienne
valeur (le SET lit les lignes d'avant), **mais le trigger écrase ensuite
`updated_at` par `now()`** — on détruirait la donnée dont vivent les statistiques
de #48, dans le geste même censé la préserver.

Mesuré sur une ligne datée du 01/03 :

```
avec désactivation du trigger : updated_at = 2026-03-01  ✅
sans                          : updated_at = 2026-09-22  ❌
```

D'où le `disable trigger tasks_updated_at` encadrant le rattrapage.

## Ce qui n'a pas été fait

Les **statistiques** (#48) lisent toujours `updated_at`, et leur index
`tasks_completed_idx` porte dessus. Les basculer sur `completed_at` serait
cohérent et plus exact, mais change l'historique affiché — une tâche renommée
après coup ne compterait plus la même semaine. Choix séparé, à trancher pour
lui-même.

La **corbeille des supprimées** se trie sur `updated_at` et non `completed_at` :
une tâche entre dans « Supprimées » à sa suppression, pas à son cochage, et
c'est cette date qui la situe dans la liste où on la voit (`leftGridAt`).
