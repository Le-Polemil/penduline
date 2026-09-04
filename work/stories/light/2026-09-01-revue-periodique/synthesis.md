---
story: "Revue périodique : ce qui stagne, ce qui n'a jamais bougé"
story_code: "revue-periodique"
issue: 47
created: 2026-09-01
completed: 2026-09-01
status: "Done"
---

# Synthèse

## Résumé

Un écran de revue volontaire, atteint depuis l'accueil, qui met sous les yeux cinq signaux
que l'usage quotidien masque : ce qui traîne au parking, ce qui n'a jamais été reclassé, ce
qui s'éternise dans *Faire*, les matrices sans activité, et l'*Éliminer* qui se remplit sans
se vider. Chaque élément est actionnable sur place, avec les vraies `TaskCard` et leur menu
habituel — donc `Ctrl+Z` défait comme partout ailleurs.

## Ce que l'implémentation a appris au ticket

Le ticket affirmait que tout était calculable « sans rien ajouter ». C'était vrai pour
quatre signaux sur cinq.

**Le signal « jamais sortie de sa case » était indécidable, pas difficile.** Le trigger
`tasks_updated_at` écrase `updated_at` à chaque update, quelle que soit la colonne : une
tâche renommée la semaine dernière et une tâche déplacée la semaine dernière sont
strictement indiscernables — or la première doit être signalée et la seconde non. D'où une
colonne `quadrant_changed_at` et son propre trigger.

**Deux signaux sur cinq ne peuvent pas être calculés côté client.** Depuis #40, `store.tasks`
ne contient que les tâches ouvertes. Une matrice dont tout vient d'être terminé passerait
pour dormante — l'exact contraire de la vérité. D'où la RPC `review_boards()`, sur le modèle
déjà retenu par `search_tasks` pour la même raison.

## Décisions

**Backfill à `now()` et non `created_at`.** L'historique des déplacements n'existe pas.
Remplir avec `created_at` aurait fait rapporter « jamais bougé depuis N mois » à toute tâche
déjà déplacée : un écran de revue qui présente comme oubliées des tâches reclassées la
semaine dernière ne perd pas un signal, il perd sa crédibilité entière. Avec `now()`, le
signal sous-rapporte pendant les premiers jours au lieu de sur-rapporter. Une absence est
honnête, un faux positif est trompeur — et l'interface porte la réserve.

**Les cinq signaux ne forment pas une partition.** Une tâche coincée dans *Faire* depuis
quarante jours apparaît dans deux signaux, parce qu'elle dit deux choses. Un test verrouille
ce recoupement, pour qu'une déduplication bien intentionnée casse un test plutôt que le
produit. Seule dérogation : « À trier » est exclu de « jamais reclassées », où il ferait
doublon avec son propre signal.

**La RPC rend des faits, jamais des verdicts.** Aucun seuil en SQL : ils vivent dans
`packages/shared/src/review.ts`, où ils sont testés, et dans `localStorage` côté réglage.
Les porter aussi en base aurait fait deux vérités à tenir à jour.

**Revue volontaire, sans notification.** Le ticket laissait le choix ouvert et suggérait le
volontariat. Seul rappel : un repère passif « dernière consultation il y a X jours » sur
l'accueil. #30 (Web Push) est un ticket à part.

**Seuils en `localStorage`.** Convention explicite du dépôt pour un état de lecture, comme
le repli des univers et celui des étapes. Corollaire assumé : les seuils ne suivent pas d'un
appareil à l'autre.

## Le défaut le plus intéressant

`Ctrl+Z` rendait la case sans rendre l'ancienneté. Une annulation **est** un changement de
case : le trigger réécrivait `now()`, et une tâche rendue à sa case d'origine ressortait de
la revue pour trente jours. Une fausse manœuvre suivie de son annulation faisait donc perdre
un signal — l'inverse exact de ce que `Ctrl+Z` promet (#46).

C'était une régression que la story introduisait, pas un comportement à documenter. Corrigé
en trois endroits : le trigger ne pose l'horodatage que si l'appelant ne l'a pas fourni ;
`quadrant_changed_at` entre dans `TaskPatch` **uniquement** pour l'inverse d'annulation ; et
`previousValues` le capture dès que le patch touche `quadrant`.

## Fichiers modifiés

**Base** — `apps/supabase/migrations/20260901120000_review.sql` (nouveau)

**Partagé** — `packages/shared/src/review.ts` et `review.test.ts` (nouveaux),
`types.ts`, `test-fixtures.ts`, `index.ts`

**Web** — `screens/Review.tsx`, `data/useReview.ts`, `data/reviewPrefs.ts` (nouveaux),
`App.tsx`, `screens/Home.tsx`, `data/store.ts`, `components/TaskCard.tsx`, `styles.css`

## Tests et validation

- **Lint** : aucun script de lint dans le dépôt.
- **Tests automatiques** : ✅ 177 verts (146 sur `main` + 31). Vérifiés non-vides par
  mutation — faire lire `updated_at` là où le code doit lire `quadrant_changed_at` fait
  tomber trois tests.
- **Migration** : ✅ validée sur Postgres 15.8 contre 4428 lignes réelles, en transaction
  annulée, RLS comprise (un `sub` inconnu obtient zéro ligne sous le rôle `authenticated`).
- **Validation manuelle** : ✅ navigateur, desktop et mobile sous émulation tactile réelle.
  Trois défauts trouvés et corrigés (`flex-basis` devenu une hauteur en colonne, poignée de
  glisser sans glisser, `Ctrl+Z` incomplet).

## Notes pour la suite

- **Le signal 2 ne dira vrai qu'après ~30 jours d'usage.** C'est le prix du backfill, et
  c'est dit à l'écran.
- **`#19` (deadlines) enrichirait la revue** d'un sixième signal « échéances dépassées ». Pas
  une dépendance, une suite naturelle.
- **Défaut connu, laissé** : une tâche présente dans deux signaux ouvre ses deux menus `⋯`
  simultanément (`menuTask` indexé par identifiant). Sans incidence fonctionnelle.
- **Piège d'environnement local** : deux stacks Supabase cohabitent sur cette machine.
  `penduline` est mappé sur **55321**, `unaya` occupe 54321. `npm run status` annonce la
  valeur de `config.toml` (54321), pas le port réellement mappé — et `.env.example` la
  reprend. Cause d'« Invalid login credentials » alors que le mot de passe est bon.
