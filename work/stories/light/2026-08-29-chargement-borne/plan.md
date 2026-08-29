---
slug: "chargement-borne"
title: "Ne plus charger ce qu'on n'affiche pas (#40)"
issues: [40]
pr: 82
created: 2026-08-29
status: "Done"
---

# #40 — Ne plus charger ce qu'on n'affiche pas

## Contexte

`useStore.load` rapatrie **toutes** les tâches, sans filtre :

```ts
supabase.from('tasks').select(TASK_COLS).order('position')
```

Corbeille et archives comprises. Chaque ouverture télécharge l'historique
complet — y compris dans le popup de l'extension, dont c'est le premier travail.
Le schéma est bien indexé : le problème n'est pas la base, c'est le volume
transféré et gardé en mémoire.

**Et #75 vient d'aggraver la pente.** Cocher écrit désormais
`{ done: true, archived: true }` d'emblée : l'archivage est devenu l'état final
**normal** de toute tâche terminée, là où il n'était auparavant écrit qu'une fois
sur deux. Le tas d'archives grossit maintenant à chaque geste.

## La ligne de partage

Depuis #75, `isVisible` masque sur `done` seul. L'ensemble réellement affiché est
donc exactement :

```
       chargé au démarrage          chargé à l'ouverture de la corbeille
     ┌────────────────────────┐   ┌──────────────────────────────────────┐
     │  !done  &&  !deleted   │   │       done  ||  deleted              │
     └────────────────────────┘   └──────────────────────────────────────┘
              la grille                   « Terminées » + « Supprimées »
```

Les deux ensembles sont **complémentaires et sans recouvrement**, et ils
correspondent trait pour trait aux prédicats déjà écrits dans les écrans
(`doneList = done && !deleted`, `delList = deleted`). Le filtre ne s'invente pas :
il se lit dans l'affichage existant.

Filtrer sur `done` plutôt que sur `archived` a un second mérite : les lignes
héritées d'avant #75 (`done` sans `archived`) partent du bon côté — hors de la
grille, dans « Terminées ».

## ⚠️ Le piège : filtrer le CHARGEMENT, jamais la mémoire

Une tâche cochée pendant la session passe à `done` par mise à jour optimiste et
doit **rester en mémoire** : c'est elle que `pending` garde affichée pendant les
quatre secondes d'annulation (`useCompletion`). Filtrer la liste en mémoire
supprimerait le délai d'annulation.

Le filtre ne s'applique donc qu'à la requête initiale.

---

## Tâches

### 1. `apps/web/src/data/store.ts`

**Chargement initial** — la requête gagne `.eq('done', false).eq('deleted', false)`.

**Contenu de la corbeille, à la demande** :

```ts
loadBin: () => Promise<void>   // idempotent, une seule fois par session
binLoaded: boolean
```

`loadBin` récupère `done.eq.true,deleted.eq.true` et **fusionne dans `tasks`**,
plutôt que d'alimenter une seconde liste. C'est ce qui fait que tout le reste
continue de marcher sans y toucher : `patchTask`, `purgeTasks` et le retour
arrière de `persist` opèrent déjà sur `tasks`.

**Sans cette fusion, « Rétablir » serait cassé** : `patchTask` fait
`setTasks(ts => ts.map(…))`, qui ne peut rien restaurer d'absent. La tâche
partirait en base et ne reviendrait jamais à l'écran.

**Compte de la corbeille, par portée** :

```ts
countBin: (boardIds: string[]) => Promise<number>
```

Une requête `head: true, count: 'exact'` — elle rend le nombre **sans transférer
une seule ligne**. C'est ce qui permet de garder le compteur du bouton exact sans
rien charger.

### 2. Les deux écrans

Ouvrir la corbeille appelle `loadBin()` avant d'afficher. `doneList` et `delList`
ne changent pas d'une ligne : elles filtrent la mémoire, qui contient désormais ce
qu'il faut au bon moment.

**Le compteur du bouton**, en deux branches :

```
binLoaded  →  mémoire filtrée sur la portée
sinon      →  countBin(portée)  +  mémoire filtrée sur la portée
```

La seconde ligne n'est pas de la prudence : avant chargement, la mémoire ne
contient que les tâches archivées **pendant cette session**, que le compte serveur
— pris au démarrage — ignore. Les additionner est exact, et le seul geste capable
de fausser la somme (restaurer, purger) exige d'avoir ouvert la corbeille, donc
d'être passé sur la première branche.

### 3. `apps/extension/src/store.ts`

Même filtre au chargement. Le popup n'a pas de corbeille : il filtre déjà
`!t.done && !t.deleted` à l'affichage, donc **rien d'autre à faire** — et c'est là
que le gain est le plus sensible, le chargement étant son premier travail à
l'ouverture.

### 4. Mesurer

Le ticket l'exige, et il a raison : *« sans chiffre, on ne saura pas si le ticket
a servi »*.

Semer quelques milliers de tâches archivées en base locale, puis relever le poids
de la réponse `/rest/v1/tasks` au démarrage, avant et après. Le chiffre va dans la
PR et dans la synthèse.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `apps/web/src/data/store.ts` | Filtre au chargement, `loadBin`, `countBin` |
| `apps/web/src/screens/Matrix.tsx`, `Global.tsx` | Ouverture de la corbeille, compteur |
| `apps/extension/src/store.ts` | Le filtre, et rien d'autre |

Aucune migration. `packages/shared` n'est pas touché : les prédicats d'affichage
sont déjà justes, c'est le chargement qui ne les respectait pas.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

94 partagés + 13 web. La logique ajoutée est du chargement, pas du calcul : elle
se vérifie en navigateur, pas en test unitaire.

### Plan de test manuel

Base locale (ports 55321-55324, `config.toml` rétabli avant commit), compte de
démo, **quelques milliers de tâches archivées semées**.

1. **Mesure** : poids de la réponse `tasks` au démarrage, avant / après
2. La grille affiche exactement ce qu'elle affichait
3. **Cocher une tâche** : elle reste barrée 4 s, le toast propose « Annuler »,
   l'annulation la remet en place — le délai n'a pas été cassé par le filtre
4. Le compteur du bouton corbeille est **juste avant ouverture**, et il
   **s'incrémente** quand on coche
5. Ouvrir la corbeille : « Terminées » et « Supprimées » sont complètes
6. **« Rétablir »** : la tâche **revient dans la grille** *(le piège)*
7. « Supprimer définitivement » et « Vider la corbeille » fonctionnent
8. Même parcours depuis la **vue globale**, sur les deux portées
9. **Popup de l'extension** : les mêmes tâches, plus vite

Les points 3 et 6 sont les deux régressions que ce ticket peut introduire.

### Livraison

Branche `story-light/chargement-borne` depuis `main`. PR assignée à `@me`,
fermant **#40**.
