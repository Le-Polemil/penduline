---
story: "Mode « aujourd'hui » : s'engager sur quelques tâches"
story_code: "mode-aujourdhui"
issue: 49
created: 2026-09-02
status: "Done"
---

# #49 — Mode « aujourd'hui » : s'engager sur quelques tâches

## Contexte

Penduline répond à « qu'est-ce que j'ai ? ». Il ne répond pas à « qu'est-ce que je fais
aujourd'hui ? ». La vue globale (#18) **liste** ce qui existe ; ici on **s'engage** — on choisit
délibérément trois tâches, toutes matrices confondues, et on s'y tient jusqu'au soir.

Ce sont deux gestes distincts, et le second n'existe nulle part dans le produit.

Le ticket porte un avertissement de conception explicite : *résister à la tentation
d'augmenter la limite*. Un « focus » de quinze tâches n'est plus un focus, c'est la liste
qu'on essayait de fuir. La valeur tient à la contrainte.

### Ce que l'exploration a établi

**Une colonne suffit, et l'expiration devient gratuite.** `tasks.focus_day date null` :
sélectionnée pour aujourd'hui = `focus_day = <date locale du jour>`. La sélection de la veille
n'expire pas, elle **cesse simplement de correspondre** — aucun `cron`, aucun nettoyage, aucune
logique de TTL. C'est ce que la table dédiée aurait coûté pour rien.

**Et elle profite aux deux surfaces presque gratuitement.** L'extension a son propre
`TASK_COLS` et son propre `patchTask` (`apps/extension/src/store.ts`) : la colonne y entre par
les mêmes canaux que les autres. Côté web, `patchTask` la rend annulable par `Ctrl+Z` sans une
ligne de plus, `previousValues` capturant les clés du patch.

---

## Décisions

### D1 — Le fuseau ne remonte jamais jusqu'à la base

Contrairement à #48, aucun paramètre de fuseau. Le client **écrit la date qu'il veut dire**
(`YYYY-MM-DD` calculé localement) et la compare à son propre aujourd'hui local. La base ne
stocke qu'une `date` sans fuseau, et n'a donc jamais à trancher.

C'est le contraire du choix de #48 — là, l'agrégation par semaine se faisait forcément côté
serveur, donc le fuseau devait voyager. Ici le client sait, et il vaut mieux qu'il dise.

### D2 — La liste du jour se charge à part, elle n'est pas fusionnée dans le store

Piège : une tâche cochée sort de `store.tasks` (#40 + `inWorkingSet`). L'écran afficherait
alors « 2 tâches » au lieu de « 3 choisies, 1 faite », et perdrait précisément le sentiment
d'avancement qui justifie l'écran.

`useFocus()` charge donc **son propre** jeu — `focus_day >= aujourd'hui − 7`, terminées
comprises — dans son état, et expose `today` et `bilan`. Un `refresh()` explicite après chaque
action, comme `useReview` en #47.

Pourquoi pas une fusion dans `store.tasks` (à la `loadBin`) : y injecter des tâches terminées
sans armer `binBoards` ferait cohabiter deux sources pour le compteur de corbeille. Le risque
ne valait pas l'économie.

Volume borné par construction : 8 jours × la limite, soit une poignée de lignes. Un simple
filtre PostgREST suffit — pas de fonction, contrairement à #45, #47 et #48.

### D3 — L'extension **lit** la sélection, elle ne la compose pas

Le critère d'acceptation dit « accessible depuis l'extension ». Elle affichera donc la liste du
jour et permettra de cocher, pas de choisir. C'est cohérent avec son rôle actuel : elle capture
et consulte, elle ne réordonne pas, ne gère pas les univers, n'a pas de corbeille.

Corollaire assumé : la limite vit dans le `localStorage` du web (convention du dépôt pour un
état de lecture), que l'extension ne peut pas lire. Comme elle ne compose pas la sélection,
elle n'a pas à la connaître.

### D4 — La limite est visible, et son dépassement s'explique

Réglable de 1 à 7, défaut **3**. Au-delà de la limite, l'entrée de menu ne disparaît pas : elle
se désactive avec une raison affichée. Un blocage muet se lit comme un bug ; un blocage
expliqué se lit comme une intention — et l'intention est tout le ticket.

Pas de réglage au-delà de 7 : le ticket demande de ne pas encourager plus, et une borne
technique dit cela mieux qu'un paragraphe d'aide.

### D5 — Le bilan est un constat, pas une note

Affiché à l'ouverture quand une sélection antérieure existe : ce qui a été fait, ce qui repart
au pot commun. Le ticket écrit « sans reproche » — donc pas de score, pas de pourcentage, pas
de « seulement 1 sur 3 ». On énonce, et on propose de repartir.

Le bilan porte sur le **jour de sélection le plus récent avant aujourd'hui**, pas sur « hier » :
sauter un week-end ne doit pas effacer le bilan du vendredi.

---

## Implémentation

### 1. Migration — `apps/supabase/migrations/20260902100000_focus.sql`

- `alter table public.tasks add column focus_day date` (nullable ; `null` = pas dans une
  sélection).
- Index partiel `(user_id, focus_day) where focus_day is not null` — le seul accès est
  « donne-moi mes tâches à focus », jamais l'inverse.
- Commentaire sur l'expiration par non-correspondance, et sur l'absence délibérée de fuseau.

### 2. `packages/shared`

- `types.ts` — `focus_day: string | null` sur `Task`, et `'focus_day'` dans `TaskPatch`.
- `focus.ts` **(nouveau)** — tout le calcul, pur :
  - `FOCUS_DEFAULT = 3`, `FOCUS_MAX = 7`, `localDay(now)` → `YYYY-MM-DD` dans le fuseau local ;
  - `focusToday(tasks, day)` → les tâches du jour, terminées comprises, ordonnées ;
  - `focusBilan(tasks, day)` → `{ day, done[], returned[] } | null` pour le jour de sélection le
    plus récent avant `day` ;
  - `canFocus(count, limit)` et le libellé de refus.
- `focus.test.ts` **(nouveau)** — le passage de minuit, le week-end sauté, la limite, une tâche
  terminée qui reste comptée dans le jour.
- `test-fixtures.ts` — `focus_day: null` dans `makeTask`.

### 3. `apps/web`

- `data/store.ts` — `focus_day` dans `TASK_COLS`.
- `data/useFocus.ts` **(nouveau)** — le chargement de D2, `refresh()`.
- `data/focusPrefs.ts` **(nouveau)** — la limite en `localStorage`, fusion sur le défaut.
- `screens/Focus.tsx` **(nouveau)** — l'écran dépouillé : les tâches choisies, le bilan, rien
  d'autre. Réutilise `TaskCard` (sans `drag`, `split`, `reorder`) et `useCompletion`.
- `components/TaskCard.tsx` — une entrée de menu « Faire aujourd'hui » / « Retirer
  d'aujourd'hui », **facultative** comme `drag` et `subtasks` : absente, elle n'existe pas.
  C'est ce qui la rend disponible sur la matrice ET la vue globale sans drapeau de mode.
- `App.tsx` / `screens/Home.tsx` — `{ kind: 'focus' }`, et l'entrée sur l'accueil.
- `styles.css` — l'écran, mobile compris.

### 4. `apps/extension`

- `store.ts` — `focus_day` dans son `TASK_COLS` (la requête charge déjà les tâches ouvertes,
  donc rien d'autre à changer).
- `App.tsx` — `screen` gagne `'focus'`, avec une entrée depuis l'accueil du popup et la liste
  du jour en lecture + cochage.

⚠️ **Conflit de fusion attendu avec #47 et #48** dans `Home.tsx` et `styles.css` : trois
tickets ajoutent désormais un bouton dans `.home-lenses`. Le conteneur porte le même nom dans
les trois branches, la résolution reste donc l'ajout de boutons frères.

---

## Vérification

**Automatique** — `npm test`, `npm run typecheck`, `npm run build`.

**Migration** — en transaction annulée d'abord : la colonne existe et vaut `null` partout ;
l'index est bien partiel ; la RLS s'applique (un `sub` inconnu ne voit aucune sélection).

**Le test qui compte : le passage de minuit.** `focusToday` et `focusBilan` reçoivent `day` en
paramètre, donc le changement de jour se teste sans toucher à l'horloge. À vérifier
explicitement, c'est le cœur du ticket et la seule chose qu'un test manuel ne peut pas
provoquer.

**Manuel (navigateur, via MCP Chrome)** — données de test additives, supprimées après :
1. Choisir trois tâches depuis deux matrices différentes → elles apparaissent dans l'écran.
2. La quatrième est refusée avec sa raison affichée, pas en silence.
3. Cocher une tâche du jour → elle reste listée, marquée faite (c'est D2 qui est en jeu).
4. `Ctrl+Z` après un ajout à la sélection → la tâche en sort.
5. Reculer `focus_day` d'un jour en base → l'écran se vide et le bilan de la veille apparaît.
6. Reculer de trois jours (week-end sauté) → le bilan porte bien sur ce jour-là.
7. Compte sans sélection → état initial soigné, pas une liste vide.
8. Mobile (390 × 844, émulation tactile réelle) et desktop.
9. Popup de l'extension : la liste du jour s'affiche et le cochage fonctionne.
