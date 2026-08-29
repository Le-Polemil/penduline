---
slug: "chargement-borne"
title: "Ne plus charger ce qu'on n'affiche pas (#40)"
issues: [40]
pr: 82
created: 2026-08-29
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `store.ts` : filtre au chargement, `loadBin`, `countBin` | Terminé | 2026-08-29 |
| 2. `Matrix.tsx` / `Global.tsx` : ouverture de la corbeille et compteur | Terminé | 2026-08-29 |
| 3. `apps/extension/src/store.ts` : même filtre | Terminé | 2026-08-29 |
| 4. Mesure avant / après sur un jeu volumineux | Terminé | 2026-08-29 |
| 5. Vérifications automatiques | Terminé | 2026-08-29 |
| 6. Validation en navigateur (9 points) | Terminé | 2026-08-29 |
| 7. Commit, push et PR fermant #40 | Terminé | 2026-08-29 |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-08-29 : le filtre, la corbeille à la demande, le compteur

**Statut** : Terminé

**Actions réalisées** :
- `store.ts` : chargement filtré sur `!done && !deleted` ; `loadBin(boardIds)`
  **scopé et paginé** qui fusionne dans `tasks` ; `binLoaded(boardIds)` ;
  `countBin(boardIds)` en `head: true, count: 'exact'` ; `binVersion`.
- `data/useBinCount.ts` *(nouveau)* : le compteur, écrit une fois pour les deux
  écrans.
- `Matrix.tsx` / `Global.tsx` : ouverture qui charge, compteur branché.
- `apps/extension/src/store.ts` : le même filtre, et rien d'autre.

**Fichiers modifiés** :
- `apps/web/src/data/store.ts`, `useBinCount.ts` *(nouveau)*
- `apps/web/src/screens/Matrix.tsx`, `Global.tsx`
- `apps/extension/src/store.ts`

**Notes** :

**🐛 Le défaut était plus grave que le ticket ne le disait.** PostgREST plafonne
ses réponses à **1000 lignes**. Mesuré sur 4 420 tâches semées :
`Content-Range: 0-999/4420`. L'application n'en recevait que mille, **sans aucune
erreur**. Le tri se fait sur `position`, que les archives conservent : ouvertes et
archivées s'entrelacent, donc passé mille tâches un compte perdait des tâches
**ouvertes** en silence. Le filtre referme ce trou par construction.

**🐛 Et j'ai commencé par reproduire ce même défaut dans la corbeille.** Mon
premier `loadBin` chargeait tout le compte, d'un coup : 4 401 éléments attendus,
**999 rendus**. Le même plafond, au même endroit. Corrigé en le rendant scopé
(on ne charge que les matrices affichées) **et paginé** — une matrice peut très
bien accumuler plus de mille tâches terminées, c'est même son état normal au bout
d'un an. Trouvé en testant, pas en relisant.

**🐛 Mon raisonnement sur le compteur était faux, et mon propre test l'a attrapé.**
J'avais écrit que le compte serveur et la mémoire étaient « disjoints par
construction », donc additionnables. Ils ne le sont pas : une corbeille chargée
depuis l'écran matrice met ses tâches en mémoire, et le compte serveur d'une portée
plus large les compte **aussi**. La vue globale affichait **8795** au lieu de 4398.

Corrigé en supprimant l'addition : **une seule source à la fois**. Chargée → la
mémoire ; sinon → un compte serveur, redemandé via `binVersion` que le store bumpe
après toute écriture touchant `done` ou `deleted`. Le compteur réagit toujours au
clic (1 → 2 → 1 vérifié), au prix de quelques dizaines de millisecondes.

**Erreur de manipulation, corrigée** : un `git add -A` a emporté le `config.toml`
aux ports décalés dans le commit de story. Rattrapé par `git checkout origin/main --`
puis amend, la branche n'étant pas poussée.

### 2026-08-29 : mesure et validation

**Statut** : Terminé

**La mesure**, sur 4 420 tâches dont 4 401 en corbeille, requêtes identiques à
celles de l'application :

| | Octets | Lignes |
|---|---|---|
| **Avant** | 377 501 | 1 000 *(tronqué : il y en avait 4 420)* |
| **Après** | **7 372** | 19 |

**51× moins de données, et surtout plus rien de tronqué.**

Le compte de corbeille, lui, ne transfère **aucune ligne** :
`Content-Range: 0-999/4401` sur une requête `head`.

**Validation en navigateur**, base locale, console sans erreur :

| Contrôle | Résultat |
|---|---|
| Compteur avant tout chargement | **4400**, exact |
| Cocher : la tâche reste barrée 4 s, toast « Annuler » | ✅ *(régression 1 écartée)* |
| Compteur pendant le délai | 4400 → **4401** |
| Annuler | la tâche revient, compteur à 4400 |
| Ouvrir la corbeille | **4 400 éléments complets**, 251 ms |
| **« Rétablir »** | la tâche **revient dans la grille** *(régression 2 écartée)* |
| Purge de 2 éléments | 4399 → 4397 |
| Compteurs matrice / vue globale, chargée ou non | 4397 / 4398 / 4397 / 4398 — **exacts** |

**Reste à savoir, hors périmètre** : la corbeille rend ses 4 400 lignes d'un coup
dans le DOM. Ça tient (251 ms), mais c'est un coût d'affichage que ce ticket ne
traite pas — il portait sur le chargement. À ouvrir si le besoin s'en fait sentir.

`npm test` : 100 partagés + 21 web · `typecheck` ✅ · `build` ✅
