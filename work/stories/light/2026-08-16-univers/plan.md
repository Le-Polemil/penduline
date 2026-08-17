---
story: "Univers : regrouper les matrices"
story_code: "univers"
issues: [17]
created: 2026-08-16
status: "Done"
---

# #17 — Univers : regrouper les matrices

## Contexte

Le modèle est plat : `boards → tasks`, sans niveau intermédiaire — un choix
revendiqué dans le README. Il tient tant qu'on a quelques matrices ; passé une
dizaine, l'accueil devient une liste indifférenciée où plus rien ne se distingue.

Les **univers** (Perso / Boulot / Maison…) redonnent de la structure sans imposer
de découpage. C'est le ticket le plus structurant du backlog restant, et il
débloque **#18** (vue globale par univers) et **#23** (univers « Contrôlé » du
serveur MCP).

C'est aussi la **première migration SQL depuis le schéma initial**. Faite
maintenant, elle porte sur une base encore petite.

### Ce dont la story hérite

Trois stories récentes lui font gagner du temps :

- `positionBefore()` accepte n'importe quel `Positioned` (#14) : les univers
  héritent de l'ordre fractionnaire **sans une ligne de code**.
- Le harnais Vitest existe (#31) : la logique de regroupement sera testée.
- L'accueil web sait déjà glisser-déposer des matrices (#14) — et c'est
  précisément ce geste que la story doit étendre.

---

## Tâches

### 1. Migration

`apps/supabase/migrations/20260816120000_universes.sql`, calquée sur l'init pour
les contraintes, l'index et la policy :

```sql
create table universes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index universes_user_idx on universes (user_id, position);

alter table universes enable row level security;
create policy "universes: owner" on universes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table boards add column universe_id uuid references universes (id) on delete set null;
create index boards_universe_idx on boards (user_id, universe_id, position);
```

**`on delete set null`, pas `cascade`.** Supprimer un univers ne doit jamais
emporter les matrices qu'il contenait : elles repassent « sans univers ». Le
regroupement est une vue sur les matrices, pas leur propriétaire.

**`universe_id` nullable**, sans univers par défaut. Le contraire imposerait un
découpage — exactement ce que le README refuse.

> ⚠️ **Je ne peux pas appliquer cette migration** : la production est un Supabase
> auto-hébergé sur Coolify, sans accès de mon côté. J'écris le fichier, tu
> l'appliques.

### 2. Types et regroupement partagé

- `Universe` dans `packages/shared/src/types.ts` ; `Board.universe_id: string | null`.
- `groupByUniverse(universes, boards)` dans `layout.ts` → une liste de
  `{ universe: Universe | null; boards: Board[] }`, univers dans l'ordre, groupe
  sans univers **en dernier**.

Le groupe sans univers va à la fin par cohérence avec « À trier », qui ferme la
grille dans `ALL = [...QUADS, PARK]`. Le non-classé se lit en bas, pas en tête.

La fonction est pure, donc testable : c'est ce qui justifie de la mettre dans
`shared` plutôt que dans le composant.

### 3. Store web

`useStore` charge les univers. CRUD complet — `addUniverse`, `renameUniverse`,
`deleteUniverse`, `reorderUniverse` — sur le modèle exact des fonctions `*Board`
existantes (mise à jour optimiste puis persistance).

Et surtout `moveBoard(id, universeId, beforeId)`, qui remplace `reorderBoard` :

**La position d'une matrice devient scopée à son univers**, comme celle d'une
tâche l'est à `(board, quadrant)`. `positionBefore` reçoit donc les seules
matrices du groupe cible.

### 4. Accueil web — le glisser affecte

Le geste retenu : **chaque interstice appartient à un univers**. Y déposer une
matrice l'y affecte *et* la positionne — un seul geste pour deux intentions, sans
ambiguïté puisque la cible est visible.

- `BoardGap` porte désormais `(universeId, index)` au lieu d'un simple index.
- Un groupe **vide** doit garder un interstice, sinon on ne peut rien y déposer —
  et un univers fraîchement créé serait inatteignable.
- En-tête par groupe : nom, actions au survol (renommer, supprimer), et le même
  motif `:focus-within` que `.board-row__actions` pour rester atteignable au
  clavier.
- « ＋ Nouvel univers » sous la liste.
- Supprimer un univers : confirmation annonçant que ses N matrices repasseront
  sans univers — c'est réversible, donc `tone: 'neutral'` (`Confirm.tsx`).

**Tactile** — le glisser HTML5 ne fonctionne pas au doigt. La feuille d'appui long
gagne « Déplacer vers un univers », à côté de Monter / Descendre / Renommer /
Supprimer. Sans elle, l'affectation serait impossible sur mobile.

### 5. Extension — regrouper, et montrer les matrices calmes

Le regroupement par univers **remplace** celui par « actives / calmes ». Le repli
« N matrices calmes » disparaît : c'est désormais le regroupement qui raccourcit
la liste.

Une matrice sans rien à faire reste **à sa place dans son univers**, distinguée
visuellement — opacité réduite et mention « Rien à faire », comme aujourd'hui,
mais en ligne au lieu d'être masquée. Repliée, elle était introuvable ; atténuée,
elle est simplement au repos.

Lecture seule : la création et l'affectation d'univers restent sur le web.

### 6. Seed et documentation

- `apps/supabase/seed.sql` : deux univers illustrant des découpages différents, et
  **au moins une matrice sans univers** — c'est un état normal, le seed doit le
  montrer.
- **`apps/supabase/README.md`** décrit `supabase link --project-ref` vers un projet
  supabase.com. La production est auto-hébergée : cette procédure ne marche pas.
  Cette migration est la première depuis ce changement, donc la première fois que
  l'écart se paie. Écrire la procédure réelle.
- `README.md` racine : le modèle n'est plus `boards → tasks` à plat.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `apps/supabase/migrations/20260816120000_universes.sql` | Nouveau |
| `apps/supabase/seed.sql`, `apps/supabase/README.md` | Univers, procédure réelle |
| `packages/shared/src/types.ts` | `Universe`, `Board.universe_id` |
| `packages/shared/src/layout.ts` + `.test.ts` | `groupByUniverse` et ses tests |
| `apps/web/src/data/store.ts` | CRUD univers, `moveBoard` |
| `apps/web/src/screens/Home.tsx` | Groupes, interstices par univers, en-têtes |
| `apps/extension/src/App.tsx`, `store.ts` | Regroupement, matrices calmes en ligne |
| `apps/web/src/styles.css`, `apps/extension/src/styles.css` | En-têtes de groupe |
| `README.md` | Le modèle a un niveau de plus |

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

`groupByUniverse` sera couvert : ordre des univers, groupe sans univers en
dernier, univers vide conservé, matrice dont l'`universe_id` pointe vers un
univers absent (donnée incohérente — ne doit pas la faire disparaître).

### Plan de test manuel

**Migration** — à appliquer sur le local (`npm run start -w @penduline/supabase`)
avant tout le reste.

1. Créer, renommer, réordonner, supprimer un univers
2. Supprimer un univers qui contient des matrices → **elles survivent**, sans univers
3. Glisser une matrice dans un autre groupe → elle change d'univers et se place là
4. Glisser dans un groupe **vide** → fonctionne
5. Réordonner à l'intérieur d'un groupe → l'ordre tient au rechargement
6. Tactile : appui long → « Déplacer vers un univers »
7. Une matrice sans univers apparaît bien dans le groupe de fin
8. Extension : mêmes groupes, matrices calmes atténuées et non masquées
9. Un compte **sans aucun univers** doit rester parfaitement utilisable — c'est
   l'état de tous les comptes existants après la migration

Le point 9 est le plus important : la migration ne crée aucun univers, donc
**tout le monde démarre sans**. Si l'accueil se lit mal dans cet état, la
fonctionnalité est ratée pour l'utilisateur qui ne s'en sert pas.

### Livraison

Branche `story-light/univers` depuis `main`. PR assignée à `@me`, fermant **#17**.
La migration devra être appliquée à la production **avant** le déploiement du
front, sinon `universe_id` n'existe pas et les lectures échouent.
