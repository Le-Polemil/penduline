---
story: "Finitions web Vague 1"
story_code: "finitions-web-vague-1"
issues: [14, 51]
created: 2026-08-16
status: "Done"
---

# Journal de développement

## Progression

| # | Tâche | Issue | Statut | Date |
|---|-------|-------|--------|------|
| 1 | `Positioned` + signatures élargies dans `layout.ts` | #14 | Terminé | 2026-08-16 |
| 2 | `reorderBoard` dans le store web | #14 | Terminé | 2026-08-16 |
| 3 | Glisser-déposer des matrices sur l'accueil | #14 | Terminé | 2026-08-16 |
| 4 | « Monter » / « Descendre » dans la feuille tactile | #14 | Terminé | 2026-08-16 |
| 5 | `partnerOf()` dans `layout.ts` | #51 | Terminé | 2026-08-16 |
| 6 | Les cinq points d'appel déplacent la paire entière | #51 | Terminé | 2026-08-16 |
| 7 | Épinglées rendues par `buildRows()` | #51 | Terminé | 2026-08-16 |
| 8 | « Dissocier » + marque visuelle de paire | #51 | Terminé | 2026-08-16 |
| 9 | Dissociation à la complétion et à la suppression | #51 | Terminé | 2026-08-16 |
| 10 | Documentation (`README.md`) | — | Terminé | 2026-08-16 |
| 11 | Vérifications qualité + test manuel | — | Terminé | 2026-08-16 |

## Journal

<!-- Les entrées sont ajoutées ici après chaque action concrète. -->

### 2026-08-16 — Tâches 1 à 4 (#14) : réordonner les matrices

**Statut** : Terminé

**Actions réalisées** :
- Interface `Positioned` dans `layout.ts` ; `endPosition` et `positionBefore`
  élargis, `partnerOf()` ajouté au passage (pour #51).
- `reorderBoard(id, beforeId)` dans le store web.
- Glisser-déposer sur l'accueil, avec interstices de dépôt (`BoardGap`).
- « ↑ Monter » et « ↓ Descendre » dans la feuille d'appui long.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`
- `apps/web/src/data/store.ts`
- `apps/web/src/screens/Home.tsx`
- `apps/web/src/styles.css`

**Notes** :

*Aucune logique de position n'a été écrite.* `positionBefore()` faisait déjà
exactement ce qu'il fallait ; le seul obstacle était son typage `Task[]`, alors
qu'il ne lit que `id` et `position`. `Positioned` l'élargit sans casser un seul
appelant — le typecheck confirme que `Task` et `Board` la satisfont. Dupliquer
aurait donné deux logiques d'ordre à maintenir en parallèle.

*Un piège de mise en page.* `.board-list` avait `gap: 10px`. En ajoutant des
interstices qui portent leur propre hauteur, l'écart se serait cumulé. Le `gap`
passe donc à zéro et l'espacement vient des interstices, ce qui laisse le rendu
identique à l'œil tout en rendant la liste manipulable.

*« Descendre » s'exprime par « avant le suivant ».* `positionBefore` ne connaît
que l'insertion *avant* un élément : descendre d'un cran, c'est passer avant le
voisin qui suit celui du dessous, ou en fin de liste s'il n'y en a pas. Écrit tel
quel dans le code plutôt que déduit par le lecteur.

**Vérifications** — le glisser-déposer HTML5 se simule mal par script, mais le
chemin tactile emprunte la **même** logique de store, donc il a été déroulé pour
de vrai :

| Étape | Résultat |
|---|---|
| Appui long tactile → feuille d'actions | ✅ ouverte |
| « Descendre » sur la dernière matrice | ✅ désactivé |
| « Monter » sur `Loisirs` | ✅ `Boulot, Loisirs, Chambre` |
| « Descendre » pour restaurer | ✅ `Boulot, Chambre, Loisirs` |
| Rechargement complet | ✅ ordre persisté |
| Interstices rendus | ✅ 4 pour 3 matrices |

⚠️ Le `.env` racine pointe sur la **production** : ce test a écrit dans les vraies
données. L'ordre d'origine a été restauré dans la foulée et vérifié après
rechargement.

### 2026-08-16 — Tâches 6 à 11 (#51) : l'appairage devient un lien

**Statut** : Terminé

**Actions réalisées** :
- `movePair()` et `unpair()` dans `Matrix.tsx`.
- Les quatre déplacements (`menuMove`, `dropEnd`, `dropInsert`, `togglePin`)
  emmènent la partenaire au lieu de casser le lien.
- `archive()` et `removeTask()` dissocient la survivante.
- Les épinglées passent par `buildRows()`.
- Entrée « Dissocier » dans le menu `⋯`, visible seulement si la tâche est appairée.
- Connecteur tireté entre les deux cartes d'une paire.
- `README.md` : l'appairage est décrit comme un lien, pas comme une mise en page.

**Fichiers modifiés** :
- `apps/web/src/screens/Matrix.tsx`
- `apps/web/src/styles.css`
- `README.md`

**Notes** :

*Il ne reste que trois `pair_id: null` dans le fichier, et ce sont les trois
voulus* : dissociation explicite, archivage, suppression. Les quatre autres — ceux
qui cassaient le lien à chaque déplacement — ont disparu.

*L'épinglage a révélé une dépendance cachée.* Les tâches épinglées étaient rendues
une par une, sans passer par `buildRows()`. Une paire épinglée se serait donc
affichée sur deux lignes, cassée visuellement, juste après qu'on ait garanti
qu'une paire reste ensemble. Le test l'a confirmé dans l'autre sens : après
correction, épingler depuis une seule carte épingle les deux **et** les garde
groupées.

*Un détail de `dropInsert`* : la liste de référence doit exclure **les deux**
tâches de la paire, pas seulement celle qu'on glisse. Sinon la partenaire servirait
de repère au déplacement de sa propre paire.

*Limite assumée* : restaurer depuis la corbeille ne restaure pas l'appairage.
Cohérent avec le reste — la corbeille ne rétablit jamais un contexte, seulement une
tâche.

**Vérifications** — l'appairage se crée par glisser-déposer, qui se simule mal.
La paire a donc été créée par l'API sur une matrice vide, puis tout a été purgé :

| Test | Résultat |
|---|---|
| Rendu côte à côte + connecteur | ✅ |
| « Dissocier » présent seulement si appairée | ✅ |
| Déplacer **une** carte vers « Planifier » | ✅ les deux ont suivi, toujours appairées |
| Épingler depuis une carte | ✅ les deux épinglées et groupées |
| Désépingler | ✅ les deux |
| Dissocier | ✅ lien rompu des deux côtés |
| `pair_id` orphelin en base | ✅ aucun |
| Purge des tâches de test | ✅ 0 restante, 0 appairage en base |

⚠️ Comme pour #14, ces écritures ont eu lieu en **production** (le `.env` racine y
pointe). Tâches de test créées sur une matrice vide et supprimées définitivement ;
état vérifié après coup.
