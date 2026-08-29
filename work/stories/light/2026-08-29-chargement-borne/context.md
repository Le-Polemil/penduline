---
slug: "chargement-borne"
title: "Ne plus charger ce qu'on n'affiche pas (#40)"
issues: [40]
created: 2026-08-29
---

# Contexte

## Description fonctionnelle

Aujourd'hui, ouvrir Penduline télécharge la totalité des tâches de l'utilisateur :
la grille, mais aussi tout ce qui est terminé et tout ce qui est supprimé.
Personne ne s'en plaint, parce que rien ne le signale — l'application affiche
exactement ce qu'il faut, elle en charge simplement beaucoup plus. Le coût est
cumulatif : chaque tâche terminée reste dans la charge utile de chaque ouverture,
définitivement. Depuis #75, cocher une tâche l'écrit d'emblée `done` **et**
`archived` : l'archivage est devenu l'état final normal de tout ce qu'on termine,
là où il n'était écrit qu'une fois sur deux. La pente s'est donc redressée — le tas
grossit maintenant à chaque geste, et il ne redescend jamais de lui-même. Ce ticket
ne corrige pas une gêne ressentie, il corrige une trajectoire.

Ce qui change se limite au chargement. La requête initiale ne rapatrie plus que ce
que la grille affiche (`!done && !deleted`) ; le contenu de la corbeille est chargé
à la demande, à sa première ouverture dans la session, et fusionné dans la même
liste en mémoire — pas dans une seconde liste, pour que tout ce qui opère déjà sur
`tasks` continue de fonctionner sans y toucher. Le compteur du bouton corbeille
reste exact sans rien charger, via un compte serveur additionné aux tâches
archivées pendant la session. Ce qui ne change pas : l'affichage, à l'octet près.
Les prédicats des écrans (`doneList`, `delList`, `isVisible`) ne bougent pas d'une
ligne — c'est d'eux qu'on tire le filtre, pas l'inverse. Aucune migration. Le popup
de l'extension reçoit le même filtre au chargement et rien d'autre.

Le piège est de filtrer la mémoire au lieu du chargement. Une tâche cochée en cours
de session passe à `done` par mise à jour optimiste et doit **rester** dans la
liste : c'est elle que `useCompletion` garde affichée pendant les quatre secondes
d'annulation. Le second piège découle du premier : si la corbeille n'était pas
fusionnée dans `tasks`, « Rétablir » écrirait en base mais ne pourrait rien
remettre à l'écran, `patchTask` opérant sur une liste où la tâche est absente.

**Critères d'acceptation.** La grille affiche exactement ce qu'elle affichait, en
vue matrice comme en vue globale, sur les deux portées. Le compteur du bouton
corbeille est juste avant toute ouverture, et s'incrémente quand on coche. La
corbeille ouverte, « Terminées » et « Supprimées » sont complètes ; « Rétablir »,
« Supprimer définitivement » et « Vider la corbeille » fonctionnent. Les deux
régressions que ce ticket peut introduire sont à vérifier explicitement : **cocher
une tâche la laisse barrée quatre secondes avec un toast « Annuler » qui la remet
en place**, et **une tâche rétablie depuis la corbeille revient dans la grille**.
Enfin, le gain doit être chiffré.

## Vue architecturale

Le correctif touche trois points seulement, et aucun n'est un nouveau concept.
`useStore` reste la source unique de l'état : une liste `tasks`, alimentée par
`load`, mutée par `patchTask` et `purgeTasks`, protégée par le retour arrière de
`persist`. Les écrans restent purement dérivés. `packages/shared` n'est pas touché
— `isVisible` et `countOpen` disent déjà la bonne chose. Ce qui change, c'est **la
frontière d'entrée**.

```
   Supabase ──┬── load()      → !done && !deleted ──┐
              │                                     ├──▶ tasks (liste unique)
              ├── loadBin()   → done || deleted ────┘        │
              │                                              ├──▶ isVisible / countOpen  → la grille
              └── countBin()  → un nombre, zéro ligne        ├──▶ doneList / delList     → la corbeille
                                       │                     └──▶ pending (useCompletion)
                                       └──────────────▶ compteur du bouton
```

La décision centrale est de **ne pas décider**. La ligne de partage ne sort pas
d'un arbitrage produit : elle se lit dans les prédicats déjà écrits. Les deux
ensembles sont complémentaires et disjoints ; leur réunion est la table. Le ticket
ne pose donc pas une règle nouvelle : il fait respecter au transport une règle que
l'affichage applique déjà. Corollaire utile : filtrer sur `done` plutôt que sur
`archived` fait tomber les lignes héritées d'avant #75 du bon côté — hors grille,
dans « Terminées » — sans migration.

`loadBin` **fusionne dans `tasks`** au lieu d'alimenter une seconde liste, et c'est
ce qui rend le reste immobile. « Rétablir » l'illustre à la lettre :

```
patchTask(id, patch)  ≈  setTasks(ts => ts.map(t => t.id === id ? {...t, ...patch} : t))
                                          └─ un map ne crée rien : absent avant, absent après
```

Sans fusion, la tâche restaurée passerait bien à `deleted: false` en base, mais
`map` ne pourrait pas la faire apparaître dans une liste qui ne la contient pas —
elle disparaîtrait de la corbeille sans revenir dans la grille. La fusion
transforme un problème d'écriture en non-problème : une seule liste, un seul `map`,
aucun code de synchronisation.

Deuxième invariant, symétrique : on filtre le **chargement**, jamais la
**mémoire**. Une tâche cochée pendant la session doit rester en mémoire quatre
secondes — c'est `pending` qui la maintient à l'écran le temps que l'annulation
soit offerte. La frontière est franche : la requête décide de ce qui *entre*,
jamais de ce qui *reste*.

```
clic ──▶ patchTask(done, archived)  ──▶ la tâche RESTE dans tasks
     └─▶ pending = id  ──(4 s)──▶ pending = null  ──▶ isVisible devient false
                                   (elle reste en mémoire, simplement plus rendue)
```

Enfin, le compteur du bouton se fait en deux branches, parce que l'information est
à deux endroits selon le moment :

```
binLoaded ?  |mémoire ∩ portée|
           :  countBin(portée)   +   |mémoire ∩ portée|
              └ pris au démarrage     └ archivé/supprimé depuis
                                         (disjoints par construction)
```

Le seul geste capable de fausser cette somme — restaurer ou purger — exige d'avoir
ouvert la corbeille, donc d'être passé sur la première branche. Pour `countBin`,
une requête `head: true, count: 'exact'` est l'outil exact du besoin : elle rend un
cardinal calculé côté base, sans transférer une seule ligne. Compter en chargeant
serait rejouer le défaut que le ticket corrige.

## Ce que la mesure a révélé, et que le ticket ne savait pas

**PostgREST plafonne les réponses à 1000 lignes.** Mesuré sur 4 420 tâches
semées : `Content-Range: 0-999/4420`. L'application n'en reçoit donc que mille,
**silencieusement** — aucune erreur, aucun signal.

Ce n'est pas un problème de volume, c'est une **perte de données à l'écran**. Le
tri se fait sur `position`, dont les valeurs sont scopées à `(board_id, quadrant)`
et que les archives conservent : ouvertes et archivées s'entrelacent donc dans
l'ordre. Passé mille tâches au total, un compte perd des tâches **ouvertes**, sans
que rien ne le dise.

Le filtre du ticket referme ce trou par construction, en ramenant l'ensemble chargé
à ce qui s'affiche — quelques dizaines de lignes au lieu de plusieurs milliers.
C'est le bénéfice le plus important de cette story, et il n'était pas prévu.
