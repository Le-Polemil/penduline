---
slug: "recherche"
title: "Recherche dans toutes les matrices (#45)"
issues: [45]
pr: 83
created: 2026-08-29
status: "Done"
---

# #45 — Recherche dans toutes les matrices

## Contexte

Il n'existe **aucune recherche**. Retrouver « ce truc à propos du plombier »
impose d'ouvrir les matrices une par une, à l'œil. Ce n'est pas une capacité qui
manque, c'est une impossibilité à réparer.

**#40, mergé il y a une heure, décide de l'architecture.** Le chargement ne
rapatrie plus que les tâches ouvertes : une recherche en mémoire ne trouverait
donc **plus rien de terminé ni de supprimé** — or le ticket demande explicitement
la corbeille, « retrouver une tâche supprimée est un cas d'usage courant ». La
recherche doit être **côté serveur**. Ce qui était un choix hier est devenu une
contrainte.

## Décisions

**Une fonction Postgres, pas un filtre REST.** `unaccent()` doit envelopper la
colonne, et la syntaxe de filtre de PostgREST ne sait pas appeler de fonction sur
un champ. D'où `search_tasks(q)`, exposée en RPC — le projet a déjà écarté les
Edge Functions et retenu les fonctions Postgres pour #25 et #36.

**`security invoker`, pas `definer`.** La policy RLS de `tasks` s'applique alors
telle quelle : la fonction n'a aucun privilège à elle, et il n'y a pas de second
modèle de sécurité à tenir à jour.

**`ilike` sur `unaccent`, sans index.** Ce que dit le ticket, et il a raison : un
`tsvector` coûterait une migration de plus pour un volume qui reste modeste. À
reconsidérer quand la mesure le dira.

**Résultats plafonnés à 50.** Même esprit que #40 : ne pas transférer ce qu'on
n'affiche pas. Au-delà, c'est la requête qu'il faut affiner, pas la liste.

---

## Tâches

### 1. Migration `20260829120000_search_tasks.sql`

```sql
create extension if not exists unaccent with schema extensions;

create or replace function public.search_tasks(q text)
returns setof public.tasks
language sql stable security invoker
set search_path = public, extensions
as $$ … $$;
```

Le motif est **échappé** : un `%` ou un `_` saisi par l'utilisateur est un
caractère, pas un joker. Sans ça, taper `%` rend toutes les tâches et la
recherche paraît folle.

Tri : les ouvertes d'abord, puis les terminées, puis les supprimées — l'ordre
dans lequel on les cherche.

> ⚠️ **Je ne peux pas appliquer cette migration en production.** Je l'écris, elle
> est appliquée localement et testée ; la production reste à faire, procédure dans
> `apps/supabase/README.md`. **Avant** le déploiement du front : sans la fonction,
> la recherche renvoie une erreur.

### 2. `apps/web/src/data/useSearch.ts`

Un hook : requête débattue (250 ms), appel RPC, résultats. Annule proprement une
requête devenue obsolète — sans ça, une réponse lente écrase une réponse rapide et
les résultats ne correspondent plus à ce qui est tapé.

### 3. `apps/web/src/components/Search.tsx`

Un dialogue, sur le motif de `useDialog` (focus à l'ouverture, `Échap`, focus
rendu). Ouvert depuis la **barre du haut**, donc disponible depuis les trois
écrans d'un coup — l'accueil, la matrice et la vue globale.

Résultats **groupés par matrice**, chaque ligne portant la couleur de sa case
(`quadrant()` de `packages/shared`). Une **section distincte** pour la corbeille :
terminées et supprimées ne se confondent pas avec ce qui reste à faire.

**Clavier** : `↑` `↓` pour parcourir, `Entrée` pour ouvrir, `Échap` pour fermer.
Le ticket l'exige, et c'est le socle de #54.

### 4. Sauter à la tâche

`View` gagne `focusTask` sur la forme `board`. La matrice fait défiler jusqu'à la
carte et la fait clignoter brièvement.

Une tâche **terminée ou supprimée** n'est pas dans la grille : son résultat ouvre
la matrice **avec la corbeille**. Ouvrir sur une grille où la tâche n'est pas
serait pire que ne rien faire.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `apps/supabase/migrations/20260829120000_search_tasks.sql` | Nouveau |
| `apps/web/src/data/useSearch.ts` | Nouveau — le hook |
| `apps/web/src/components/Search.tsx` | Nouveau — le dialogue |
| `apps/web/src/App.tsx` | Bouton dans la barre, `focusTask` dans `View` |
| `apps/web/src/screens/Matrix.tsx` | Défilement et clignotement |
| `apps/web/src/styles.css` | Le dialogue et ses résultats |

L'extension est **hors périmètre** : le ticket ne la mentionne pas, et son popup
de 400 px n'est pas le lieu d'une recherche multi-matrices.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

### Plan de test

Base locale, migration appliquée, données de démo.

1. **`eleve` trouve `élève`**, et `ELEVE` aussi — le critère qui fait paraître une
   recherche cassée quand il manque
2. Résultats de **plusieurs matrices**, groupés et identifiés
3. Une tâche **supprimée** apparaît, dans sa section
4. Un `%` saisi ne rend pas tout
5. Cliquer un résultat **ouvre sa matrice sur la tâche**, qui clignote
6. Un résultat de corbeille ouvre la matrice **avec la corbeille**
7. **Au clavier seul** : ouvrir, taper, `↑` `↓`, `Entrée`, `Échap`
8. Recherche vide, recherche sans résultat : pas d'écran cassé

### Livraison

Branche `story-light/recherche` depuis `main`. PR assignée à `@me`, fermant **#45**.
