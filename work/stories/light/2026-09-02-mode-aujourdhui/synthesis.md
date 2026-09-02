---
story: "Mode « aujourd'hui » : s'engager sur quelques tâches"
story_code: "mode-aujourdhui"
issue: 49
created: 2026-09-02
completed: 2026-09-02
status: "Done"
---

# Synthèse

## Résumé

Penduline savait répondre à « qu'est-ce que j'ai ? ». Il répond maintenant à « qu'est-ce que je
fais aujourd'hui ? ». On choisit délibérément trois tâches depuis n'importe quelle matrice, on
les retrouve seules sur un écran dépouillé, et la sélection expire à la fin de la journée. Le
soir, un bilan dit ce qui a été fait et ce qui repart au pot commun.

## La décision structurante

**Une colonne, et l'expiration devient gratuite.** `tasks.focus_day date` : la sélection de la
veille ne s'efface pas, elle **cesse de correspondre** au jour courant. Aucun `cron`, aucun
travail de nettoyage, aucune logique de TTL — c'est tout ce qu'une table dédiée aurait coûté
pour un résultat identique. Et la valeur de la veille survit exprès : c'est elle qui permet le
bilan du soir.

Elle traverse les deux surfaces par les canaux existants. L'extension a son propre `TASK_COLS`
et son propre `patchTask` ; côté web, `patchTask` rend le geste annulable par `Ctrl+Z` sans une
ligne de plus.

## Décisions

**Aucun fuseau dans la base, à l'inverse de #48.** Là-bas, l'agrégation par semaine était
forcément serveur, donc le fuseau devait voyager. Ici la question est « quel jour sommes-nous »,
le client le sait, il écrit la date qu'il veut dire. D'où le type `date` : une date sans fuseau
ne peut pas être mal interprétée. Et `localDay` utilise `toLocaleDateString('en-CA')`, surtout
pas `toISOString().slice(0, 10)` — ce dernier donne le jour UTC, et à Paris tout ce qui est fait
après 22 h serait attribué au lendemain.

**La liste du jour se charge à part.** Une tâche cochée sort de `store.tasks` (#40) : l'écran
afficherait « 2 tâches » au lieu de « 3 choisies, 1 faite », perdant le sentiment d'avancement
qui le justifie. La fusionner dans le store à la manière de `loadBin` aurait fait cohabiter deux
sources pour le compteur de corbeille — le risque ne valait pas l'économie d'une requête.

**La limite est visible, et son dépassement s'explique.** Réglable de 1 à 7, défaut 3. Le refus
n'est pas un masquage : l'entrée de menu se désactive avec son motif et `aria-disabled`. Un
blocage muet se lit comme un bug, un blocage expliqué se lit comme une intention — et
l'intention est tout le ticket.

**L'extension lit, elle ne compose pas.** Un bandeau en tête du popup plutôt qu'un écran :
dans 400 px, ce sur quoi on s'est engagé doit être visible à l'ouverture.

## Le défaut trouvé en validant

**Cocher une tâche ne se voyait pas.** `refresh()` partait avant que l'écriture n'ait abouti,
donc la relecture ramenait l'état d'avant. Temporiser aurait été un pansement, et faux — aucun
délai n'est garanti.

Le correctif est une **superposition** : la liste du serveur recouverte par l'état optimiste de
`store.tasks`. Les deux sources se complètent exactement — le store porte la coche
immédiatement, la copie serveur couvre les tâches que `inWorkingSet` a évacuées.

Plus deux ajustements : `pinnedCard={false}` (épingler veut dire « en haut de sa case », et cet
écran n'a pas de case), et la typographie française du bilan (`capitalize` donnait « Mardi 1
Septembre »).

## Fichiers modifiés

**Base** — `apps/supabase/migrations/20260902100000_focus.sql` (nouveau)

**Partagé** — `packages/shared/src/focus.ts` et `focus.test.ts` (nouveaux), `types.ts`,
`test-fixtures.ts`, `index.ts`

**Web** — `screens/Focus.tsx`, `data/useFocus.ts`, `data/focusPrefs.ts` (nouveaux), `App.tsx`,
`screens/Home.tsx`, `screens/Matrix.tsx`, `screens/Global.tsx`, `components/TaskCard.tsx`,
`data/store.ts`, `styles.css`

**Extension** — `src/App.tsx`, `src/store.ts`, `src/styles.css`

## Tests et validation

- **Linting** : aucun script de lint dans le dépôt.
- **Tests automatiques** : ✅ 167 verts (146 sur `main` + 21). La mutation qui retire le filtre
  de jour fait tomber trois tests, dont « se vide au passage au jour suivant ».
- **Migration** : ✅ 9/9 en transaction annulée, dont le comportement central et la RLS.
- **Validation manuelle** : ✅ trois tâches choisies, quatrième refusée avec motif ; passage de
  minuit vérifié en reculant `focus_day` ; week-end sauté vérifié (bilan remonté quatre jours en
  arrière) ; mobile sous émulation tactile réelle. Base restaurée à l'identique.

## Notes pour la suite

- **Conflit de fusion attendu** dans `Home.tsx` et `styles.css` avec #47 (PR #100) et #48
  (PR #103) : les trois ajoutent un bouton dans `.home-lenses`. Nom de conteneur volontairement
  identique dans les trois branches — la résolution reste l'ajout de boutons frères.
- **La poignée `⠿` s'affiche sur les cartes de cet écran** alors qu'elles ne sont pas
  déplaçables. Défaut préexistant de `TaskCard` que #47 corrige déjà ; le dupliquer ici aurait
  créé un conflit garanti pour aucune différence à la livraison.
- La migration est appliquée à la base locale.
