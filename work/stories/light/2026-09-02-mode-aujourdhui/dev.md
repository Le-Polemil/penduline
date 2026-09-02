---
story: "Mode « aujourd'hui » : s'engager sur quelques tâches"
story_code: "mode-aujourdhui"
issue: 49
created: 2026-09-02
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `tasks.focus_day date` + index partiel | Terminé | 2026-09-02 |
| 2. `packages/shared` : `focus_day` sur `Task` et `TaskPatch`, fixture | Terminé | 2026-09-02 |
| 3. `packages/shared/focus.ts` : `localDay`, `focusToday`, `focusBilan`, limite | Terminé | 2026-09-02 |
| 4. `packages/shared/focus.test.ts` : passage de minuit, week-end sauté, limite | Terminé | 2026-09-02 |
| 5. `apps/web` : `TASK_COLS`, `useFocus.ts`, `focusPrefs.ts` | Terminé | 2026-09-02 |
| 6. `TaskCard` : entrée de menu facultative « Faire aujourd'hui » | Terminé | 2026-09-02 |
| 7. `screens/Focus.tsx` : l'écran dépouillé et le bilan | Terminé | 2026-09-02 |
| 8. `App.tsx` + `Home.tsx` : routage `{ kind: 'focus' }` et entrée | Terminé | 2026-09-02 |
| 9. `styles.css` : styles de l'écran | Terminé | 2026-09-02 |
| 10. `apps/extension` : `TASK_COLS` + écran `'focus'` en lecture | Terminé | 2026-09-02 |
| 11. Qualité : tests, typecheck, build | Terminé | 2026-09-02 |
| 12. Validation migration en transaction annulée | Terminé | 2026-09-02 |
| 13. Validation manuelle navigateur (dont le passage de minuit) | Terminé | 2026-09-02 |

## Journal

### 2026-09-02 : la colonne, le calcul, les deux surfaces

**Statut** : Terminé

**Actions réalisées** :
- Migration `tasks.focus_day date` + index partiel `tasks_focus_idx`.
- `packages/shared/focus.ts` : `localDay`, `focusToday`, `focusBilan`, `focusRefusal`,
  `FOCUS_DEFAULT = 3`, `FOCUS_MAX = 7`.
- `packages/shared/focus.test.ts` : **21 tests**.
- `apps/web` : `TASK_COLS`, `useFocus.ts`, `focusPrefs.ts`, `screens/Focus.tsx`, routage,
  entrée sur l'accueil, styles.
- `TaskCard` : prop `focus` facultative, branchée sur la matrice ET la vue globale.
- `apps/extension` : `TASK_COLS` + bandeau « Aujourd'hui » sur l'accueil du popup.
- 167 tests verts, `typecheck` et `build` propres.

**Notes** :

**L'expiration est gratuite, et c'est le cœur du ticket.** `focus_day = <jour local>` : la
sélection de la veille ne s'efface pas, elle **cesse de correspondre**. Aucun `cron`, aucun
nettoyage, aucun TTL. Et sa valeur survit exprès — c'est elle qui permet le bilan du soir.
Vérifié en SQL et dans le navigateur : reculer `focus_day` d'un jour vide l'écran et fait
apparaître le bilan, sans qu'une seule ligne ait été supprimée.

**Aucun fuseau dans la base, à l'inverse de #48.** Là-bas l'agrégation par semaine était
forcément serveur, donc le fuseau devait voyager. Ici la question est « quel jour sommes-nous »,
le client le sait, il écrit la date qu'il veut dire. D'où le type `date` et non `timestamptz` :
une date sans fuseau ne peut pas être mal interprétée. `localDay` utilise
`toLocaleDateString('en-CA')` et surtout **pas** `toISOString().slice(0, 10)`, qui donne le jour
UTC — à Paris, tout ce qui est fait après 22 h serait attribué au lendemain et la sélection du
soir se viderait sous les doigts de l'utilisateur.

---

#### Défaut trouvé en validant : cocher ne se voyait pas

`refresh()` partait **avant** que l'écriture n'ait abouti, donc la relecture ramenait l'état
d'avant : la tâche cochée restait affichée non faite, et le compteur à `0 / 3`.

Temporiser aurait été un pansement, et faux — aucun délai n'est garanti. Le correctif est une
**superposition** : la liste du serveur est recouverte par l'état optimiste de `store.tasks`.
Les deux sources se complètent exactement — le store porte la coche immédiatement pour les
tâches encore en mémoire, la copie serveur couvre celles que `inWorkingSet` a évacuées (#40).
Après correctif : `1 / 3`, tâche marquée faite et repoussée en bas de liste.

#### Deux ajustements en cours de route

- **`pinnedCard={false}`** au lieu de `t.pinned` : épingler veut dire « en haut de sa case », et
  cet écran n'a pas de case. Le fanion y désignait un ordre inexistant.
- **Typographie française du bilan** : `text-transform: capitalize` donnait « Mardi 1
  Septembre ». Les noms de jour et de mois sont en minuscules en français ; seule la première
  lettre se hausse, via `::first-letter`.

#### Écart assumé au plan : bandeau plutôt qu'écran dans l'extension

Le plan prévoyait un `screen: 'focus'` dans le popup. J'ai fait un **bandeau en tête de
l'accueil** : dans 400 px, ce sur quoi on s'est engagé doit être visible à l'ouverture, pas
derrière une navigation. Moins de code, et un meilleur geste.

Asymétrie assumée avec le web : le popup ne charge que les tâches **ouvertes**, il ne peut donc
pas afficher « 1 faite sur 3 ». Il montre ce qui **reste** — ce qui, dans un popup dédié à
l'action rapide, se lit comme de l'avancement plutôt que comme une perte.

#### Vérifications

**Migration** — 9/9 en transaction annulée, dont le comportement central (« demain la sélection
est vide », « la valeur survit pour le bilan ») et la RLS.

**Tests** — 21 sur `focus.ts`. La mutation qui retire le filtre de jour fait tomber trois tests,
dont « se vide au passage au jour suivant ». Le jour est un paramètre partout, ce qui rend
testable la seule chose qu'un test manuel ne peut pas provoquer.

**Navigateur** — trois tâches choisies depuis le menu `⋯`, la quatrième refusée avec son motif
affiché et `aria-disabled` ; passage de minuit vérifié ; week-end sauté vérifié (bilan remonté
au samedi 29 août, quatre jours en arrière) ; mobile sous émulation tactile réelle, aucune cible
sous 44 px, aucun débordement. Base restaurée à l'identique.

#### Reste connu, non corrigé

La poignée de glisser `⠿` s'affiche sur les cartes de cet écran alors qu'elles ne sont pas
déplaçables. C'est le défaut préexistant de `TaskCard` que **#47 corrige déjà** (PR #100) : le
dupliquer ici créerait un conflit garanti entre deux PR ouvertes pour aucune différence visible
à la livraison. Il arrivera avec #47.
