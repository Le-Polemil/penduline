---
story: "Statistiques rétrospectives par case"
story_code: "statistiques"
issue: 48
created: 2026-09-01
status: "In Progress"
---

# #48 — Statistiques rétrospectives par case

## Contexte

La matrice d'Eisenhower promet une prise de conscience : *tu passes ton temps dans l'urgent,
pas dans l'important*. Penduline permet de classer, mais ne restitue jamais ce constat. Les
listes de tâches classiques comptent ce qui est fait ; aucune ne dit **dans quel quadrant on
vit**. C'est, comme le note le ticket, le différenciateur le moins cher du backlog.

Cinq lectures attendues : répartition des tâches terminées par case, tendance dans le temps,
délai moyen création → complétion par case, comparaison entre matrices, et **au moins un
constat formulé en clair**.

### Ce que l'exploration a changé au cadrage

**Bonne nouvelle, et c'est ce qui distingue #48 de #47 : aucune migration n'est nécessaire.**

Je m'attendais au même problème que #47 — pas de `completed_at`, donc une date de complétion
seulement approchée. Le correctif de #75 a réglé la question sans le savoir. Depuis lui,
cocher n'est plus qu'**une seule écriture** portant `done` et `archived` ensemble, immédiate
(`useCompletion.ts`, `planPairDetach(tasks, task, { done: true, archived: true, pinned: false })`).
Il n'y a plus d'écart de quatre secondes en base.

Donc `updated_at` sur une tâche `done` **est** l'instant de complétion, exactement — pas un
proxy. Là où #47 se heurtait à une donnée *indécidable*, #48 dispose d'une donnée *exacte par
construction*. Ajouter une colonne serait dupliquer ce que la base sait déjà.

Deux conséquences à assumer et à dire :
- Une tâche terminée **puis supprimée** porte la date de sa suppression, pas de sa
  complétion. Elle sort donc des statistiques (`done and not deleted`) — cohérent avec la
  note du ticket sur les tâches purgées.
- Une tâche restaurée puis re-terminée compte à sa **dernière** complétion. C'est le
  comportement juste.

---

## Décisions

### D1 — Tout est côté serveur, et ce n'est pas un choix

Depuis #40, `store.tasks` ne contient **que les tâches ouvertes**. Or #48 ne parle que de
tâches terminées : il n'y a rien à calculer en mémoire, zéro pour cent du ticket. Une RPC
n'est pas une optimisation ici, c'est la seule voie.

### D2 — La RPC rend **un seul objet `jsonb`**, pas un `setof`

`apps/supabase/config.toml:13` porte `max_rows = 1000`, et ce plafond s'applique aussi aux
fonctions renvoyant un `setof` — silencieusement, exactement le piège de #40. Une table de
faits `(semaine × matrice × case)` sur un an d'usage actif s'en approche dangereusement, et
la tronquerait sans rien dire : des statistiques fausses, sans erreur.

Une fonction renvoyant `jsonb` tient dans **une ligne**, donc hors de portée du plafond, et
un seul aller-retour :

```
completion_stats(since timestamptz) → jsonb
{
  "by_quadrant": [ { quadrant, completed, age_seconds_total } ],       -- ≤ 5
  "by_week":     [ { week, quadrant, completed } ],                    -- semaines × 5
  "by_board":    [ { board_id, quadrant, completed, age_seconds_total } ]
}
```

C'est un écart au précédent de `search_tasks` (qui rend `setof tasks`), et il est assumé pour
cette raison précise.

### D3 — Des sommes et des comptes, **jamais** de moyennes

`age_seconds_total` plutôt que `age_seconds_avg`. Une moyenne pré-calculée par la base
interdit tout regroupement ultérieur : moyenner des moyennes de tailles différentes donne un
résultat faux, et faux d'une manière que personne ne remarque. En rendant la somme et le
compte, le client peut regrouper par case, par matrice ou par période sans jamais se tromper.

### D4 — Aucune bibliothèque de graphiques, du SVG écrit à la main

Le dépôt n'a aucune dépendance d'affichage, auto-héberge ses polices et s'interdit tout CDN
par choix de confidentialité (commentaire d'`index.html`). Il écrit à la main son
glisser-déposer, son annulation et sa persistance optimiste. `recharts` (~100 ko) pour quatre
graphiques simples y serait un corps étranger — et les couleurs existent déjà : `q.ink` /
`q.bg` de `packages/shared/src/quadrants.ts`, que l'accueil utilise déjà pour ses pastilles
par case (`Home.tsx:633`) et que `contrast.test.ts` vérifie.

⚠️ **Le skill `dataviz` sera chargé avant d'écrire la première ligne de graphique**, comme
mes instructions l'exigent.

### D5 — Le constat en clair : descriptif, avec une lecture, jamais une note

Le ticket porte une tension : il exige un ton « factuel », « pas vocation à noter son
utilisateur », mais son propre exemple est interprétatif (« tu éteins des incendies »).

Arbitrage : la phrase énonce d'abord le **fait mesuré**, puis propose une lecture au
conditionnel, et ne qualifie jamais la personne.

> « 60 % de ce que vous avez terminé ce mois-ci venait de *Faire*. C'est la case de l'urgence
> — beaucoup de choses vous arrivent avant d'être planifiées. »

Et non : « tu éteins des incendies », qui juge.

### D6 — Trois périodes, pas un sélecteur de dates

30 jours / 3 mois / 12 mois. Un sélecteur libre coûterait un composant de calendrier pour un
gain nul : personne ne compare le 3 au 17 mars.

---

## Implémentation

### 1. Migration — `apps/supabase/migrations/20260901140000_stats.sql`

- `completion_stats(since timestamptz) returns jsonb`, `stable security invoker`,
  `set search_path = public` — même contrat de sécurité que `search_tasks` : la RLS de
  `tasks` s'applique telle quelle, pas de second modèle à tenir.
- Prédicat unique de « terminée » : `done and not deleted and parent_id is null`.
  `parent_id is null` pour la même raison qu'en #47 — cocher une étape n'est pas terminer une
  tâche, et `isOpenRow` porte déjà cette règle côté client.
- `by_week` : `date_trunc('week', updated_at)::date`.
- Index partiel `(user_id, updated_at) where done and not deleted and parent_id is null`.
- Commentaire obligatoire sur le fondement de `updated_at` (le correctif de #75) — sans lui,
  un futur lecteur croira à un proxy approximatif et sera tenté d'« améliorer » la chose.

### 2. `packages/shared/src/stats.ts` (nouveau)

Tout le calcul dérivé, pur, `now` injecté :

- `CompletionStats` (le miroir du `jsonb`) et `StatsPeriod` = `30j | 3m | 12m`.
- `parseCompletionStats(raw)` — validation défensive de la forme `jsonb`, qui n'a pas de
  typage à la frontière. Une clé manquante rend une section vide, jamais un plantage.
- `statsReadings({ stats, boards, period })` → les quatre lectures :
  - part par case (compte + pourcentage) ;
  - séries hebdomadaires par case, **trous comblés à zéro** — une semaine sans complétion
    doit être un creux dans la courbe, pas un point absent qui la ferait mentir ;
  - délai moyen par case, calculé depuis `age_seconds_total / completed` ;
  - comparaison par matrice, triée par volume.
- `statsSentence(readings)` → le constat en clair (D5), ou `null` si la matière est trop
  mince pour dire quoi que ce soit (< 5 tâches terminées) — mieux vaut se taire que
  généraliser sur trois tâches.
- Réutilise `QUADS` / `quadrant()` de `quadrants.ts`, jamais de libellé recopié.

### 3. `packages/shared/src/stats.test.ts` (nouveau)

Un test par lecture, plus les pièges :
- **moyenne de moyennes** : deux matrices aux volumes très différents, vérifier que le délai
  moyen global n'est pas la moyenne des deux moyennes ;
- semaine sans complétion → zéro présent dans la série ;
- compte vide → toutes les lectures vides, `statsSentence` à `null` ;
- matière trop mince → `statsSentence` à `null` ;
- `jsonb` malformé (clé absente, type inattendu) → sections vides, pas d'exception.

### 4. `apps/web`

- `data/useStats.ts` (nouveau) — appelle `completion_stats`, sur le modèle de `useSearch` :
  `vivant` pour ne pas écrire dans un état démonté, échec silencieux mais **distingué** de
  « zéro », comme `useReview` l'a établi en #47.
- `screens/Stats.tsx` (nouveau) — l'écran, en SVG à la main. État initial soigné pour un
  compte neuf : ce qui viendra, pas un graphique vide.
- `App.tsx` — `View` gagne `{ kind: 'stats' }`, `readView` le valide, `Workspace` le route.
- `screens/Home.tsx` — entrée à côté de `.home-global`.
- `styles.css` — styles de l'écran, lisible en mobile (critère du ticket).

⚠️ **Conflit de fusion attendu avec #47** (PR #100) : les deux tickets ajoutent une entrée à
côté de `.home-global` dans `Home.tsx` et `styles.css`. Ce n'est pas une dépendance
fonctionnelle — les branches partent toutes deux de `main`, comme demandé — mais la seconde
fusionnée demandera une résolution triviale (deux boutons frères). Je la traiterai à ce
moment-là.

---

## Vérification

**Automatique** — `npm test` et `npm run typecheck`. Pas de script de lint dans le dépôt.

**Migration** — appliquée sur le Postgres local en **transaction annulée** d'abord, comme en
#47 :
1. la fonction rend un `jsonb` de la forme attendue sur des données réelles ;
2. les comptes de `by_quadrant` égalent un comptage direct, case par case ;
3. la somme de `by_week` égale celle de `by_quadrant` — c'est le test qui attrape une erreur
   de fenêtre ou de fuseau ;
4. RLS : sous le rôle `authenticated`, un `sub` inconnu obtient des sections **vides**.

**Manuel (navigateur, via MCP Chrome)** — avec des données de test additives datées, dans une
matrice dédiée, supprimées après validation :
1. Les quatre lectures s'affichent et concordent entre elles (la somme des parts fait 100 %).
2. Changer de période recalcule tout ; une période sans donnée affiche un état vide soigné,
   pas des axes nus.
3. Une semaine sans complétion est un creux, pas un trou.
4. Le constat en clair apparaît au-delà de 5 tâches, et se tait en dessous.
5. Une tâche terminée puis supprimée **sort** des statistiques (comportement assumé).
6. Vue mobile (390 × 844, émulation tactile réelle — sans quoi `hover: none` ne s'applique
   pas et la mesure ne veut rien dire) et desktop (1440 × 900).
7. Pas de débordement horizontal : les graphiques défilent dans leur propre conteneur.

**Attention au fuseau.** `date_trunc('week', …)` travaille dans le fuseau de la session
Postgres, le navigateur affiche dans celui de l'utilisateur. Un décalage ferait basculer les
complétions du dimanche soir dans la mauvaise semaine. À vérifier explicitement, c'est le
défaut le plus probable de ce ticket.
