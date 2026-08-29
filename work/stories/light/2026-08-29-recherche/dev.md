---
slug: "recherche"
title: "Recherche dans toutes les matrices (#45)"
issues: [45]
pr: 83
created: 2026-08-29
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `unaccent` et la fonction `search_tasks` | Terminé | 2026-08-29 |
| 2. `data/useSearch.ts` : requête débattue, annulation des réponses obsolètes | Terminé | 2026-08-29 |
| 3. `components/Search.tsx` : dialogue, groupement, clavier | Terminé | 2026-08-29 |
| 4. `App.tsx` : bouton dans la barre, `focusTask` dans `View` | Terminé | 2026-08-29 |
| 5. `Matrix.tsx` : défilement et clignotement de la tâche visée | Terminé | 2026-08-29 |
| 6. Styles | Terminé | 2026-08-29 |
| 7. Vérifications automatiques | Terminé | 2026-08-29 |
| 8. Validation en navigateur (8 points) | Terminé | 2026-08-29 |
| 9. Commit, push et PR fermant #45 | Terminé | 2026-08-29 |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-08-29 : la fonction Postgres, le dialogue, le saut

**Statut** : Terminé

**Actions réalisées** :
- Migration `20260829120000_search_tasks.sql` : `unaccent` + `search_tasks(q)`,
  `security invoker`, motif échappé, plafond à 50, tri ouvertes → terminées →
  supprimées.
- `data/useSearch.ts` : requête débattue à 250 ms, réponses obsolètes annulées.
- `components/Search.tsx` : dialogue, deux sections, groupement par matrice,
  parcours `↑` `↓` `Entrée`.
- `App.tsx` : bouton dans la barre du haut ; `View` gagne `focusTask` et `openBin`.
- `Matrix.tsx` + `TaskCard.tsx` : défilement et clignotement de la tâche visée.
- Styles.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260829120000_search_tasks.sql` *(nouveau)*
- `apps/web/src/data/useSearch.ts`, `components/Search.tsx` *(nouveaux)*
- `apps/web/src/App.tsx`, `screens/Matrix.tsx`, `components/TaskCard.tsx`, `styles.css`

**Notes** :

**#40 a décidé de l'architecture, pas moi.** Le chargement ne rapatriant plus que
les tâches ouvertes, une recherche en mémoire ne trouverait ni les terminées ni
les supprimées — or la corbeille est un cas d'usage explicite du ticket. Ce qui
aurait pu être un choix hier est devenu une contrainte.

**Une fonction, parce qu'un filtre REST ne peut pas.** `unaccent()` doit envelopper
la colonne, et la syntaxe de PostgREST ne sait pas appeler de fonction sur un
champ. `security invoker` fait porter la sécurité par la policy RLS existante,
plutôt que d'en créer une seconde à tenir à jour.

**🐛 `useDialog` volait le focus au champ.** Il focalise le PANNEAU — ce qu'il
faut pour une corbeille ou une confirmation, dont on parcourt les boutons. Ici on
ouvre pour taper : la recherche s'ouvrait et n'acceptait rien. Trouvé au premier
essai en navigateur, pas à la relecture. Corrigé par une reprise de focus après
celle du dialogue.

**Stack assumée** : la branche est partie de `main`, mais `openBin` a besoin de
`store.loadBin`, qui vient de #40 (PR #82, non mergée). Rebasée sur
`story-light/chargement-borne` ; la PR cible donc cette branche, pas `main`.

### 2026-08-29 : validation en navigateur

**Statut** : Terminé — console sans erreur.

| Contrôle | Résultat |
|---|---|
| `eleve` trouve « Réviser le dossier de l'**élève** » | ✅ |
| `ELEVE` aussi | ✅ |
| `devis` : deux sections, deux matrices groupées | Résultats / Corbeille · Cette semaine / Cuisine |
| Une tâche **supprimée** apparaît, dans sa section | ✅ |
| `%` ne rend pas tout | 1 seul résultat, celui qui contient « 50% » |
| Focus au champ à l'ouverture | ✅ *(après correctif)* |
| `↑` `↓` traversent les sections | Relire → Envoyer → Remise → Envoyer |
| `Entrée` ouvre la matrice, la carte **clignote** | « Cette semaine », carte « Envoyer le devis » |
| Résultat de corbeille | ouvre « Cuisine » **avec la corbeille**, tâche visible |
| `Échap` ferme | ✅ |

`npm test` : 100 + 21 · `typecheck` ✅ · `build` ✅
