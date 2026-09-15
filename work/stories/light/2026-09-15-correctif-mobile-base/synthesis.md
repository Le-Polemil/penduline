---
story: "Correctif Mobile 1/3 — la base"
story_code: "correctif-mobile-base"
created: 2026-09-15
completed: 2026-09-15
status: "Done"
---

# Synthèse

## Résumé

Premier des trois lots de la passe mobile (#89) : les défauts **statiques**,
visibles sans interagir. L'audit a été mené en A/B (390 × 844 tactile contre
1440 × 900) sur une base locale enrichie de cas limites, et l'inventaire publié
sur l'issue.

Le constat central : sous `(hover: none)`, les deux raccourcis d'une carte
passaient à 44 × 44 pour rester frappables, soit 88 px sur 306 — **deux commandes
secondaires occupaient plus de largeur que la seule chose qu'on vient lire**. Le
titre tombait à 91 px, 13 avec une échéance, zéro dans une paire.

## Changements réalisés

- **Un geste de balayage** sous 720 px révèle un bandeau de trois actions (étape,
  aujourd'hui, échéance) posé derrière la carte. Titre : 176 px au lieu de 91.
- **« Ajouter une étape » rejoint le menu `⋯`** — l'action n'existait jusqu'ici que
  sur la carte, donc nulle part au doigt. C'est la condition qui permettait d'en
  retirer les raccourcis (WCAG 2.5.1).
- **L'en-tête de matrice ne déborde plus** : `flex-wrap` et `min-width: 0`. Le
  bouton corbeille de la vue globale, jusqu'ici entièrement hors écran, redevient
  atteignable.
- **Une paire s'empile** sous 720 px, sa marque de lien basculant à la verticale
  dans l'axe des cases à cocher.
- **Toutes les cibles tactiles atteignent 44 px** sous `(pointer: coarse)`, sans
  grossir un seul dessin : `min-height` là où c'est possible, extension de zone
  de frappe par `::after` ailleurs, `<label>` pour la case native de la corbeille.
- **Les quatorze déclarations de champ passent à 16 px** sous `(pointer: coarse)` :
  en dessous, iOS zoome à chaque mise au point et n'en ressort pas seul.
- **Les marges de sécurité sont enfin honorées** — `env(safe-area-inset-*)`
  n'apparaissait qu'une fois dans tout le projet malgré `viewport-fit=cover` — et
  `.auth` passe de `100vh` à `100dvh`.

## Décisions structurantes

**Deux axes de requête média, et pas un seul.** La largeur (`max-width: 720px`)
décide de la géométrie et des gestes ; le pointeur (`pointer: coarse`) décide de
l'ergonomie. Le projet les mélangeait, ce qui gonflait les icônes de l'iPad sans
lui rendre de place. L'erreur a d'ailleurs été refaite une fois pendant le
développement, sur la case à cocher et le `⋯`, et rattrapée en vérifiant sur iPad.

**Le balayage et le glisser-déposer ne se rencontrent jamais.** Ce n'est pas un
arbitrage à l'exécution mais une **exclusion à la construction** : sous 720 px le
balayage est monté et `draggable` désarmé ; au-dessus, l'inverse. Le seuil est une
largeur et non `(hover: none)` parce que le glisser HTML5 **fonctionne sur iPad**
(Safari, depuis iOS 11) et pas sur téléphone.

## Fichiers modifiés

- `apps/web/src/data/useBalayage.ts` *(nouveau)* — geste, fonctions pures, seuil
- `apps/web/src/data/useBalayage.test.ts` *(nouveau)* — 7 tests
- `apps/web/src/components/TaskCard.tsx` — bandeau, commandes uniques, entrée de menu
- `apps/web/src/components/BinModal.tsx` — étiquette de 44 px sur la case
- `apps/web/src/screens/{Matrix,Global,Focus,Review}.tsx` — état `swipeTask`
- `apps/web/src/styles.css` — géométrie, cibles, champs, marges de sécurité

## Tests et validation

- **Linting** : ⚪ le projet n'en a pas (la CI est `typecheck` + `test` + `build`)
- **Tests automatiques** : ✅ 233 + 34, dont 7 nouveaux
- **Typecheck / build** : ✅
- **Relecture A/B** : ✅ 390 / 834 / 1024 / 1440 — aucune cible sous 44 px, aucun
  champ sous 16, `scrollWidth` égal à la fenêtre partout, desktop inchangé
- **Validation manuelle** : ⏳ en attente

## Notes

- **`prefers-reduced-motion` n'a pas été exercé.** L'outil d'émulation disponible
  ne couvre pas cette caractéristique média : la règle est en place mais n'a pas
  été jouée dans un navigateur. À vérifier à la main.
- **Le glisser tactile réel reste à faire.** Au doigt, déplacer une tâche passe
  toujours par le menu `⋯`. Remplacer le glisser HTML5 par du Pointer Events
  ferait marcher le geste partout — c'est une refonte des deux écrans et des
  interstices de dépôt, donc un ticket à lui seul.
- **Le menu `⋯` mesure désormais 705 px de haut** au doigt (entrées à 44 px).
  Il reste atteignable — le document s'étend à sa hauteur — mais il est devenu
  long, et un jour il vaudra mieux le remplacer par une feuille par le bas, comme
  celle que l'accueil ouvre déjà à l'appui long.
- **Constaté hors périmètre** : case à cocher sans aucun contour sur « Aujourd'hui »
  et « Revue » (`--q-ink` absent hors quadrant fait tomber tout le raccourci
  `border`) → #92 ; raccourcis `Alt+↑ / Alt+↓` affichés au doigt → #90.
