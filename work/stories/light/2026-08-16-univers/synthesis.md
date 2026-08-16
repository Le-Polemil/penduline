---
story: "Univers : regrouper les matrices"
story_code: "univers"
issues: [17]
pr: 62
created: 2026-08-16
completed: 2026-08-16
status: "Done"
---

# Synthèse

## Résumé

Les matrices peuvent être regroupées en univers. Premier niveau ajouté au modèle
depuis le schéma initial, et première migration depuis lors.

Débloque **#18** (vue globale par univers) et **#23** (univers « Contrôlé » du
serveur MCP).

## Décisions et leur raison

**`universe_id` nullable + `on delete set null`.** Les deux disent la même chose :
le regroupement est une **vue** sur les matrices, pas leur propriétaire. Supprimer
un univers ne doit jamais emporter ce qu'il contenait — sans quoi ranger
deviendrait risqué, et personne ne rangerait.

**Le groupe sans univers ferme la liste**, par cohérence avec « À trier » qui
ferme la grille (`ALL = [...QUADS, PARK]`). Le non-classé se lit en bas.

**Une matrice nouvellement créée arrive sans univers**, exactement comme une tâche
capturée arrive dans « À trier ». Créer et classer sont deux gestes distincts.

**Chaque interstice appartient à un univers.** Le geste de dépôt existait déjà
pour réordonner (#14) ; il range désormais aussi. Un seul geste pour deux
intentions, la cible restant visible pendant le déplacement. Un groupe vide garde
son interstice, sinon un univers neuf serait inatteignable.

**Le regroupement vit dans `packages/shared`**, pas dans les composants :
testable, et écrit une seule fois pour le web et l'extension. La leçon de #60
était fraîche.

**Dans l'extension, il remplace le regroupement actives/calmes.** Deux dimensions
dans 400 px seraient illisibles. Une matrice au repos ne disparaît plus derrière un
repli : elle reste à sa place, atténuée. Repliée elle était introuvable ; atténuée
elle est simplement au repos.

## Ce que le travail a mis au jour

**🐛 `on delete set null` fait survivre les matrices, il ne les range pas.** Après
suppression d'un univers, ses matrices s'intercalaient dans un ordre arbitraire
avec celles déjà libres — les positions étant scopées par univers, deux matrices
pouvaient porter la même. Pas une perte de données, mais le genre de petite
fausseté qui érode la confiance. `deleteUniverse` les renumérote désormais à la
suite, en conservant leur ordre d'origine.

Trouvé **en testant**, pas en relisant : le scénario ne saute aux yeux qu'une fois
deux groupes réellement peuplés.

**Le typecheck ne protège de rien sur ce genre de changement.** `Board` gagne un
champ requis, et `npm run typecheck` passe sans broncher — le client Supabase
renvoie du `any`. Les endroits où `universe_id` manquerait ne sont pas signalés.

**La documentation de déploiement était fausse depuis le passage à
l'auto-hébergement.** `apps/supabase/README.md` décrivait `supabase link
--project-ref` vers supabase.com. Cette migration est la première depuis ce
changement, donc la première fois que l'écart se paie.

## Fichiers modifiés

- `apps/supabase/migrations/20260816120000_universes.sql` *(nouveau)*
- `apps/supabase/seed.sql`, `apps/supabase/README.md`
- `packages/shared/src/types.ts`, `layout.ts`, `layout.test.ts`, `test-fixtures.ts`
- `apps/web/src/data/store.ts`, `screens/Home.tsx`, `styles.css`
- `apps/extension/src/App.tsx`, `store.ts`, `styles.css`
- `README.md`

## Tests et validation

- **Tests automatiques** : ✅ 42 (36 → 42)
- **Typecheck / build** : ✅ trois workspaces
- **Base locale** : ✅ migration, groupes, suppression d'univers, persistance,
  création, déplacement par la feuille tactile
- **Compte sans aucun univers** : ✅ vérifié contre la **production**, où la table
  n'existe pas encore — l'accueil rend exactement comme avant
- **Glisser-déposer entre groupes** : ⛔ non simulable de façon fiable ; le chemin
  tactile exerce la même logique de store

## Avant de déployer

1. **Appliquer la migration à la production** — procédure dans
   `apps/supabase/README.md`. Elle doit précéder le déploiement du front : une
   colonne lue mais absente fait échouer la lecture, l'inverse est sans effet.
2. Dérouler le glisser-déposer entre groupes à la souris.

## Note d'environnement

Les ports Supabase locaux étaient occupés par la stack d'un autre projet
(`unaya`). Ceux de Penduline ont été décalés temporairement puis rétablis —
`config.toml` vérifié identique à `HEAD`, et les conteneurs `unaya` intacts.

## Et après

**#18** (vue globale) et **#23** (serveur MCP) sont désormais débloqués. Reste
aussi la Vague 0 (#34, #35) et la Mise en conformité (#36, #38), qui sont les
vrais préalables à une ouverture publique.
