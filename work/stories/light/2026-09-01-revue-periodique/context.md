---
story: "Revue périodique : ce qui stagne, ce qui n'a jamais bougé"
story_code: "revue-periodique"
issue: 47
created: 2026-09-01
---

# Contexte

## Description fonctionnelle

Penduline sait ranger, pas relancer. Un utilisateur pose ses tâches dans les cases, puis
l'outil se tait : rien ne lui signale que « À trier » enfle depuis trois semaines, qu'une
tâche dort dans *Planifier* depuis l'hiver, ou qu'une matrice entière n'a plus bougé depuis
l'été. C'est exactement là que la méthode d'Eisenhower se joue — une matrice qu'on ne
revisite pas est une liste comme une autre, et le produit ne fait aujourd'hui rien pour
l'empêcher.

La valeur livrée est un **écran de revue volontaire**, ouvrable depuis l'accueil, qui met
sous les yeux cinq signaux que l'usage quotidien masque : ce qui traîne au parking, ce qui
n'a jamais été reclassé, ce qui s'éternise dans *Faire*, les matrices sans activité, et
l'*Éliminer* qui se remplit sans jamais se vider. Chaque élément listé est **actionnable sur
place** — reclasser, épingler, supprimer — parce qu'une revue qui ne permet que de constater
ajoute une corvée au lieu d'en retirer une.

Le périmètre s'arrête à la lecture et à l'action immédiate. Il n'introduit ni notification,
ni relance, ni score : la revue reste un miroir qu'on choisit de consulter. Les seuils
(14 jours au parking, 30 sans reclassement, 7 dans *Faire*, 21 pour une matrice) sont
réglables, avec des défauts sensés, et vivent dans le navigateur — c'est un état de lecture,
pas une donnée de compte.

Trois critères d'acceptation gouvernent la qualité perçue : le ton reste factuel et jamais
culpabilisant ; l'écran est lisible avec beaucoup comme avec peu de matière, y compris sur un
compte neuf où tous les signaux sont à zéro ; et il tient sur mobile.

## Vue architecturale

Le ticket supposait que tout était calculable depuis l'existant. Deux contraintes du dépôt
démentent cette hypothèse, et dictent l'architecture.

**Contrainte 1 — `updated_at` est trop grossier.** Un unique trigger l'écrase à chaque
update, quelle que soit la colonne touchée. Le signal « jamais sortie de sa case » est donc
indécidable : renommer une tâche et la déplacer produisent le même effet observable. D'où une
colonne dédiée, mise à jour par son propre trigger.

```
  UPDATE tasks SET title = 'x'      →  updated_at = now()
                                       quadrant_changed_at  INCHANGÉ
  UPDATE tasks SET quadrant = 'p'   →  updated_at = now()
                                       quadrant_changed_at = now()
```

Le trigger reste **séparé** de `set_updated_at()`, qui est générique et ne mentionne aucune
table ; y coudre une règle sur `tasks.quadrant` la spécialiserait pour un seul appelant.

**Contrainte 2 — le client ne connaît pas ses archives.** Depuis #40, `store.tasks` ne
contient que les tâches ouvertes (`inWorkingSet`). Deux des cinq signaux exigent l'inverse :

```
   ┌─ en mémoire (store.tasks, tâches ouvertes) ────────────────┐
   │  1  parking ancien        2  jamais reclassée              │
   │  3  Faire qui s'éternise                                   │
   └─────────────────────────────────────────────────────────────┘
   ┌─ RPC review_boards()  (a besoin des archives) ─────────────┐
   │  4  matrice dormante   →  max(updated_at) TOUTES tâches    │
   │  5  Éliminer bouché    →  compte des sorties d'Éliminer    │
   └─────────────────────────────────────────────────────────────┘
```

Sans le passage serveur, une matrice dont tout vient d'être terminé passerait pour dormante —
l'exact contraire de la vérité, et une erreur qui décrédibiliserait l'écran entier. Le dépôt
a déjà tranché ce dilemme à l'identique pour la recherche (`search_tasks`), dont le
commentaire dit précisément « depuis #40, le client ne charge plus que les tâches ouvertes ».
La revue suit ce précédent : une RPC `stable` / `security invoker`, sans modèle de sécurité
propre, la RLS de `tasks` s'appliquant telle quelle à l'intérieur.

**Découpage du calcul.** Toute la logique de seuils part dans `packages/shared/src/review.ts`,
pure et avec `now` injecté en paramètre — un calcul de dates non injectable ne se teste pas.
L'écran ne fait que rendre le résultat. Impact sur l'existant volontairement nul : une colonne
ajoutée à `TASK_COLS`, un membre de plus au type `View`, et rien d'autre. `inWorkingSet`, le
temps réel et la corbeille ne bougent pas.

## Impacts UX

Un nouvel écran de premier niveau, à côté de la vue globale, atteint par un bouton sur
l'accueil portant le repère « dernière revue il y a X jours » — le seul rappel du produit,
passif et sans notification.

```
  ┌─────────────────────────────────────────────────┐
  │  Revue                     dernière : il y a 6 j│
  ├─────────────────────────────────────────────────┤
  │  ▾  Au parking depuis plus de 14 jours       4  │
  │     [carte] [carte] [carte] [carte]             │
  │                              seuil : 14 j  ⚙    │
  ├─────────────────────────────────────────────────┤
  │  ▸  Jamais reclassées depuis 30 jours        0  │
  │     Rien ne dort. ·  mesuré depuis le suivi     │
  ├─────────────────────────────────────────────────┤
  │  ▸  Dans « Faire » depuis plus de 7 jours    2  │
  ├─────────────────────────────────────────────────┤
  │  ▸  Matrices sans activité (21 j)            1  │
  ├─────────────────────────────────────────────────┤
  │  ▸  « Éliminer » qui ne se vide pas          1  │
  └─────────────────────────────────────────────────┘
```

Trois partis pris. **Un signal à zéro s'affiche, il ne se masque pas** : « rien ne traîne au
parking » est une information rassurante, et un écran qui se vide de ses sections paraît
cassé. **Les cartes sont les vraies `TaskCard`**, avec leur menu `⋯` habituel — donc reclasser
depuis la revue se fait avec le geste déjà connu, et `Ctrl+Z` le défait comme ailleurs ;
aucun vocabulaire d'interaction nouveau à apprendre. **Le ton est descriptif** : on nomme ce
qu'on mesure (« créées il y a plus de 30 jours et jamais modifiées depuis »), jamais ce qu'il
faudrait en penser.

Accessibilité : chaque section est un `group` nommé, les compteurs ne servent pas d'intitulé
à leur bouton (l'erreur corrigée sur `.bin-btn`), et les seuils sont des champs étiquetés, pas
des curseurs seuls. Sur mobile les sections repliées deviennent la vue par défaut, une seule
colonne de cartes.
