---
story: "Mode « aujourd'hui » : s'engager sur quelques tâches"
story_code: "mode-aujourdhui"
issue: 49
created: 2026-09-02
---

# Contexte

## Description fonctionnelle

Penduline sait répondre à « qu'est-ce que j'ai ? ». Il ne sait pas répondre à « qu'est-ce que
je fais aujourd'hui ? ». La vue globale **liste** ce qui existe, matrices confondues ; elle ne
permet pas de s'**engager**. Ce sont deux gestes différents, et le second n'existe nulle part
dans le produit — alors que c'est celui qu'on fait chaque matin.

La valeur livrée est un mode « aujourd'hui » : choisir délibérément un petit nombre de tâches,
depuis n'importe quelle matrice, et les retrouver seules sur un écran dépouillé — sans les
cases, sans le reste. La sélection **expire à la fin de la journée**, et c'est précisément ce
qui la distingue d'un épinglage : repartir d'une page blanche chaque matin fait partie de
l'exercice. Le soir, un bilan dit ce qui a été fait et ce qui repart au pot commun.

Le périmètre s'arrête là. Pas d'objectif à se fixer, pas de série à entretenir, pas de score.
Le ticket porte un avertissement de conception explicite, et il gouverne tout le reste :
*résister à la tentation d'augmenter la limite*. Un « focus » de quinze tâches n'est plus un
focus, c'est la liste qu'on essayait de fuir. La limite est donc réglable mais bornée, et
visible dans l'interface plutôt que cachée dans un refus muet.

Deux choix de périmètre à assumer. L'extension **lit** la sélection et permet de cocher, mais
ne la compose pas : le critère d'acceptation dit « accessible », et composer relève du geste
réfléchi qu'on fait devant ses matrices. Et le bilan est un constat, jamais une note — le
ticket écrit « sans reproche », donc ni pourcentage, ni « seulement 1 sur 3 ».

Critères d'acceptation : choisir depuis n'importe quelle matrice, un écran dédié sans le reste
de l'interface, une sélection qui se vide au changement de jour, un bilan de fin de journée,
l'accès depuis l'extension, et une limite visible et assumée.

## Vue architecturale

**Une colonne, et l'expiration devient gratuite.** `tasks.focus_day date null` : sélectionnée
pour aujourd'hui = `focus_day` égale la date locale du jour.

```
   lundi    focus_day = 2026-09-07   → dans la sélection du jour
   mardi    focus_day = 2026-09-07   → ne correspond plus, donc sortie
```

Rien n'expire : la valeur **cesse simplement de correspondre**. Aucun `cron`, aucun travail de
nettoyage, aucune logique de TTL à maintenir — c'est tout ce qu'une table dédiée aurait coûté
pour un résultat identique.

**Et elle traverse les deux surfaces par les canaux existants.** L'extension a son propre
`TASK_COLS` et son propre `patchTask` ; la colonne y entre comme les autres. Côté web,
`patchTask` la rend annulable par `Ctrl+Z` sans une ligne de plus, `previousValues` capturant
les clés du patch.

**Le fuseau ne remonte pas jusqu'à la base**, et c'est l'inverse du choix de #48 :

```
  #48  agrégation par semaine → forcément côté serveur → le fuseau doit voyager
  #49  « quel jour sommes-nous ? » → le client le sait → il écrit la date qu'il veut dire
```

La base ne stocke qu'une `date` sans fuseau et n'a jamais à trancher.

**Le piège du chargement, et pourquoi la liste du jour vit à part.** Une tâche cochée sort de
`store.tasks` — c'est `inWorkingSet` et #40. L'écran afficherait alors « 2 tâches » au lieu de
« 3 choisies, 1 faite », perdant exactement le sentiment d'avancement qui le justifie.

```
   store.tasks           useFocus()
   ───────────           ──────────
   tâches OUVERTES       focus_day >= aujourd'hui − 7
   (#40)                 terminées COMPRISES
                              │
                              ▼
                    today[]  ·  bilan
```

`useFocus` charge donc son propre jeu, borné par construction (8 jours × la limite, soit une
poignée de lignes), et un simple filtre PostgREST suffit — pas de fonction, contrairement à
#45, #47 et #48. Le fusionner dans `store.tasks` à la manière de `loadBin` aurait fait
cohabiter deux sources pour le compteur de corbeille : le risque ne valait pas l'économie.

**Impact sur l'existant : une entrée de menu facultative.** `TaskCard` gagne une prop optionnelle,
comme `drag`, `split` et `subtasks` — absente, le geste n'existe pas. C'est ce qui rend la
sélection disponible sur la matrice ET la vue globale sans introduire de drapeau de mode.

## Impacts UX

Un écran délibérément pauvre : les tâches choisies, et rien d'autre. Pas de cases, pas de
compteurs de quadrant, pas de recherche de plus. Le dépouillement n'est pas une économie de
travail, c'est la fonctionnalité.

```
  ┌─────────────────────────────────────────────┐
  │  Aujourd'hui                          2 / 3 │
  ├─────────────────────────────────────────────┤
  │  BOULOT                                     │
  │  ○  Relire la spec de l'API                 │
  │  BOULOT                                     │
  │  ✓  Répondre à l'appel d'offres      faite  │
  ├─────────────────────────────────────────────┤
  │  Une place reste libre.                     │
  │  Choisissez-la depuis une matrice, par ⋯    │
  └─────────────────────────────────────────────┘

  ── le lendemain ────────────────────────────────
  ┌─────────────────────────────────────────────┐
  │  Aujourd'hui                          0 / 3 │
  ├─────────────────────────────────────────────┤
  │  Hier — vendredi 5 septembre                │
  │  Fait     Répondre à l'appel d'offres       │
  │  Reparti  Relire la spec de l'API           │
  │           Ces tâches ont retrouvé leur case.│
  ├─────────────────────────────────────────────┤
  │  Rien de choisi pour aujourd'hui.           │
  └─────────────────────────────────────────────┘
```

Trois partis pris. **La matrice d'origine est rappelée sous chaque tâche** : la sélection
agrège, et sans elle on ne sait plus de quel contexte on parle. **Une tâche cochée reste
affichée, marquée faite** — la faire disparaître effacerait la preuve de l'avancement, qui est
la moitié de l'intérêt de l'écran. **Le refus de la quatrième tâche s'explique** : l'entrée de
menu se désactive avec sa raison, parce qu'un blocage muet se lit comme un bug là qu'un blocage
expliqué se lit comme une intention — et l'intention est tout le ticket.

Le bilan emploie « reparti au pot commun », pas « non fait ». La nuance est le ticket : ces
tâches ne sont pas un échec, elles ont retrouvé leur case et attendent un autre jour.

Accessibilité : le compteur « 2 / 3 » est doublé d'un texte explicite pour le lecteur d'écran
(un « 2 / 3 » nu ne s'énonce pas), l'entrée de menu désactivée porte `aria-disabled` avec sa
raison plutôt que de disparaître, et le bilan est une région nommée. Sur mobile, l'écran est
déjà une colonne unique — c'est le seul de l'application qui n'a rien à réorganiser.
