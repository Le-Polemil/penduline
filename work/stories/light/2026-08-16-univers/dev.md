---
story: "Univers : regrouper les matrices"
story_code: "univers"
issues: [17]
created: 2026-08-16
status: "In Progress"
---

# Journal de développement

## Progression

| # | Tâche | Statut | Date |
|---|-------|--------|------|
| 1 | Migration `universes` + `boards.universe_id` | Terminé | 2026-08-16 |
| 2 | Type `Universe` et `groupByUniverse()` dans `shared` + tests | Terminé | 2026-08-16 |
| 3 | Store web : CRUD univers et `moveBoard` | Terminé | 2026-08-16 |
| 4 | Accueil web : groupes, en-têtes, interstices par univers | Terminé | 2026-08-16 |
| 5 | Accueil web : actions tactiles (« Déplacer vers un univers ») | Terminé | 2026-08-16 |
| 6 | Extension : regroupement, matrices calmes en ligne | Terminé | 2026-08-16 |
| 7 | Seed local avec univers | Terminé | 2026-08-16 |
| 8 | Documentation (`apps/supabase/README.md`, `README.md`) | Terminé | 2026-08-16 |
| 9 | Vérifications qualité + test manuel | Terminé | 2026-08-16 |

## Journal

<!-- Les entrées sont ajoutées ici après chaque action concrète. -->

### 2026-08-16 — Tâches 1 et 2 : migration et regroupement

**Statut** : Terminé

**Actions réalisées** :
- Migration `20260816120000_universes.sql` : table `universes`, policy RLS
  `owner`, `boards.universe_id` en `on delete set null`, index dédié.
- `Universe` dans `types.ts`, `Board.universe_id`.
- `groupByUniverse()` et `UniverseGroup` dans `layout.ts`.
- Fixtures `makeBoard()` / `makeUniverse()`, 6 tests (42 au total).

**Fichiers modifiés** :
- `apps/supabase/migrations/20260816120000_universes.sql` (nouveau)
- `packages/shared/src/types.ts`, `layout.ts`, `layout.test.ts`, `test-fixtures.ts`

**Notes** :

*⚠️ Le typecheck ne protège de rien ici, et c'est important de le savoir.*
`Board` gagne un champ requis `universe_id`, mais `npm run typecheck` passe sans
broncher : le client Supabase renvoie du `any`, donc `setBoards(data ?? [])`
accepte n'importe quoi. Les endroits où `universe_id` manquerait ne seront pas
signalés — il faut les trouver à la lecture, pas au compilateur.

*Un index nouveau, pas seulement une colonne.* `boards_user_idx` porte sur
`(user_id, position)`. L'accueil lit désormais les matrices groupées par univers
puis triées par position : ce parcours n'était plus couvert, d'où
`boards_universe_idx`.

*Deux cas dégradés couverts par les tests, tous deux du même genre : ne jamais
faire disparaître une matrice.* Un `universe_id` pointant vers un univers absent
(donnée incohérente) retombe dans le groupe sans univers plutôt que de rendre la
matrice invisible. Et le groupe sans univers existe **même vide**, parce que c'est
la cible de dépôt qui permet de SORTIR une matrice de son univers — le supprimer
rendrait l'opération impossible.

*Un test vaut pour la migration elle-même* : « rend un seul groupe quand il n'y a
aucun univers ». C'est l'état de **tous** les comptes au lendemain du déploiement,
puisque la migration n'en crée aucun.

### 2026-08-16 — Tâches 3 à 9 : interface, extension, seed et documentation

**Statut** : Terminé

**Actions réalisées** :
- Store web : chargement des univers, CRUD complet, `moveBoard` remplaçant
  `reorderBoard`.
- Accueil web : groupes, en-têtes avec actions, interstices par univers,
  « Déplacer vers un univers » dans la feuille tactile, confirmation de
  suppression au ton neutre.
- Extension : regroupement par univers, matrices au repos atténuées en ligne.
- Seed : deux univers et une matrice sans univers.
- `apps/supabase/README.md` : procédure de production réécrite.
- `README.md` : le modèle a un niveau de plus.

**Fichiers modifiés** : store et écran d'accueil web, `App.tsx` et `store.ts` de
l'extension, les deux feuilles de style, `seed.sql`, les deux README.

**Notes** :

*🐛 Un défaut trouvé en testant, invisible à la lecture.* Supprimer un univers
faisait bien survivre ses matrices — mais elles **s'intercalaient dans un ordre
arbitraire** avec celles déjà sans univers. Cause : les positions sont scopées par
univers, donc `Cuisine` (position 0 dans « Maison ») et `Un jour peut-être`
(position 0 sans univers) collisionnaient. `on delete set null` fait survivre les
matrices, il ne les range pas.

`deleteUniverse` les renumérote donc explicitement **à la suite** des matrices
déjà libres, en conservant leur ordre d'origine. Ce n'était pas une perte de
données, mais c'est exactement le genre de petite fausseté qui érode la confiance :
l'utilisateur voit ses matrices se disperser sans comprendre pourquoi.

*La dégradation avant migration a été vérifiée pour de vrai.* Le dev server
pointant sur la production — où la table `universes` n'existe pas — l'accueil rend
**exactement comme avant** : la lecture échoue (404 en console), `universes` reste
vide, aucun en-tête n'est rendu. C'est à la fois le critère « compte sans univers »
et la garantie qu'un front déployé avant la migration ne casse rien.

*Le local a demandé un détour.* Les ports 54321-54324 étaient occupés par la stack
Supabase d'un **autre projet** de l'utilisateur (`unaya`). Plutôt que de l'arrêter,
les ports de Penduline ont été décalés temporairement (55321-55324), puis
`config.toml` rétabli — vérifié identique à `HEAD` après coup. Les 12 conteneurs
`unaya` n'ont pas été touchés.

**Vérifications sur base locale**, migration et seed appliqués :

| Test | Résultat |
|---|---|
| Migration : table, colonne, policy RLS | ✅ |
| Groupes rendus, « Sans univers » en dernier | ✅ |
| Supprimer un univers → 4 matrices survivent | ✅ |
| Confirmation explicite, ton neutre | ✅ |
| Ordre après suppression, une fois corrigé | ✅ à la suite, ordre conservé |
| Persistance après rechargement | ✅ |
| Créer un univers | ✅ |
| Déplacer une matrice via la feuille tactile | ✅ |
| Compte **sans aucun univers** (prod) | ✅ identique à avant |

**Non vérifié** : le glisser-déposer entre groupes, qui ne se simule pas de façon
fiable — comme les autres gestes HTML5 du projet. Le chemin tactile exerce la même
logique de store et fonctionne.
