---
slug: "recherche"
title: "Recherche dans toutes les matrices (#45)"
issues: [45]
pr: 83
created: 2026-08-29
completed: 2026-08-29
status: "Done"
---

# Synthèse

## Résumé

Une recherche sur le titre, toutes matrices confondues, corbeille comprise.
Insensible à la casse et aux accents, utilisable au clavier seul, et un résultat
mène à sa tâche.

## Décisions et leur raison

**#40 a décidé de l'architecture, pas moi.** Le chargement ne rapatriant plus que
les tâches ouvertes, une recherche en mémoire ne trouverait ni les terminées ni les
supprimées — or la corbeille est un cas d'usage explicite du ticket. Ce qui aurait
été un choix hier est devenu une contrainte.

**Une fonction Postgres, parce qu'un filtre REST ne peut pas.** `unaccent()` doit
envelopper la colonne, et la syntaxe de PostgREST ne sait pas appeler de fonction
sur un champ. `security invoker` fait porter la sécurité par la policy RLS
existante plutôt que d'en créer une seconde à tenir à jour.

**Le motif est échappé.** Un `%` saisi est un caractère qu'on cherche, pas un
joker. Sans ça, taper « % » rend toute la table.

**Deux sections, un groupe par matrice.** Une liste plate de titres ne dit pas
d'où ils viennent — le problème même que la recherche doit résoudre.

**Un résultat de corbeille ouvre la matrice avec la corbeille.** Ouvrir sur une
grille où la tâche n'est pas serait pire que ne rien faire.

**Pas d'index `tsvector`**, comme le dit le ticket : le volume reste modeste, et
`unaccent()` n'étant pas immuable, l'indexer demanderait un enrobage de plus.

## Ce que le travail a mis au jour

**🐛 `useDialog` volait le focus au champ.** Il focalise le panneau — ce qu'il faut
pour une corbeille ou une confirmation, dont on parcourt les boutons. Ici on ouvre
pour **taper** : la recherche s'ouvrait et n'acceptait rien. Trouvé au premier
essai en navigateur, invisible à la relecture.

Le motif « un dialogue prend le focus » avait été posé en #38 pour trois surfaces
qui se ressemblaient. La quatrième ne se ressemble pas.

**Stack assumée.** La branche est partie de `main`, mais `openBin` a besoin de
`store.loadBin`, qui vient de #40. Rebasée sur `story-light/chargement-borne` ; la
PR cible cette branche.

## Fichiers modifiés

- `apps/supabase/migrations/20260829120000_search_tasks.sql` *(nouveau)*
- `apps/web/src/data/useSearch.ts`, `components/Search.tsx` *(nouveaux)*
- `apps/web/src/App.tsx`, `screens/Matrix.tsx`, `components/TaskCard.tsx`, `styles.css`

## Tests et validation

- **Automatiques** : ✅ 100 partagés + 21 web · typecheck ✅ · build ✅ · CI ✅
- **En base**, avant toute interface : `eleve` / `ELEVE` / `élève` trouvent tous
  « Réviser le dossier de l'élève » ; `%` ne rend que la tâche qui en contient un ;
  une requête vide ne rend rien
- **En navigateur**, console sans erreur : les huit points du plan, dont le
  parcours clavier traversant les sections, le clignotement à l'arrivée, et
  l'ouverture de la corbeille pour un résultat supprimé

## Avant de déployer

**La migration doit atteindre la production avant le front** — sans la fonction,
la recherche renvoie une erreur. Je n'ai pas accès au Coolify.

## Et après

Le socle est partagé avec **#54** (palette de commandes) : le dialogue, le
parcours clavier et le débattement s'y réemploient tels quels.
