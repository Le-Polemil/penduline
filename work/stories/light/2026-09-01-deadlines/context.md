---
slug: "deadlines"
title: "Deadlines : échéance, statut « dans le rouge » et tri"
created: 2026-09-01
---

# Contexte

## Description fonctionnelle

Penduline classe les tâches dans l'espace — urgent, important — mais pas dans le
temps. Une tâche qui doit être faite avant mardi et une tâche sans date se
ressemblent trait pour trait. L'utilisateur compense de tête, ou en écrivant
« avant mardi » dans le titre. C'est le manque que ce ticket comble : poser une
échéance, la voir, et être rattrapé par celles qu'on a laissées filer.

Le périmètre est délibérément le premier étage seul. On pose une date et une
heure sur une tâche, depuis le menu `⋯`, dans l'app web comme dans l'extension.
La tâche porte alors un badge dont la couleur suit trois états : neutre au-delà
de 24 h, « bientôt » dans les 24 h, **rouge** une fois l'heure passée. Le statut
n'est jamais écrit en base — il se déduit de `due_at` et de l'heure courante à
chaque rendu, ce qui évite d'avoir à faire tourner quoi que ce soit pour qu'il
soit juste.

Une échéance dépassée ne se contente pas de colorer : la tâche **remonte** en
tête de sa case. C'est le geste que le ticket rend possible — ouvrir une matrice
et voir immédiatement ce qu'on a laissé passer, sans le chercher. La contrepartie
est assumée : tant qu'elle est dans le rouge, cette tâche n'est plus ordonnable à
la main, son rang appartient à son échéance.

Ce qui n'est **pas** livré : aucune automatisation. Rien ne se déplace, rien ne
s'épingle, rien ne notifie. `due_at` est le prérequis de #22 (actions
automatiques), #30 (notifications) et #32 (alerte plein écran) ; ce ticket existe
pour qu'il se livre seul, sans dépendre du moteur de planification de #20.

Critères d'acceptation retenus, repris de l'issue :

- Poser, modifier, retirer une échéance — web et extension.
- Statut rouge sur les tâches dépassées, dans les deux hôtes.
- Le statut se recalcule **sans rechargement** : l'app peut rester ouverte des
  heures, et un onglet laissé de côté doit être juste au retour.
- Les échéances passent la frontière de fuseau horaire — stockage en UTC.

## Vue architecturale

Une **colonne**, pas une table : une tâche a au plus une échéance, contrairement
aux liens de #78 qui justifiaient leur propre table. `tasks.due_at timestamptz
null`, plus un index partiel sur `(user_id, due_at)` restreint aux lignes
pertinentes — l'immense majorité des tâches n'auront jamais d'échéance, et un
index plein les indexerait toutes pour rien.

Toute la logique décidable vit dans `packages/shared/src/layout.ts`, en fonctions
pures dont le dernier paramètre est `now: number = Date.now()`. C'est le patron
déjà posé par `isFreshCapture` (#78), et c'est la seule façon de tester une règle
temporelle sans stub d'horloge. Corollaire imposé par le dépôt : il n'existe
aucun test de composant React, donc **ce qui n'est pas dans `layout.ts` n'est pas
testé**. Le statut, le tri, le formatage et la conversion de fuseau y descendent
tous ; l'interface ne fait que les appeler.

Le point de tension est le tri. Le schéma ci-dessous dit pourquoi :

```
        RENDU                          CALCUL D'INSERTION
  buildRows(visibleTasks())      insertPosition(rows, index)
            │                              │
            │   ordre AFFICHÉ              │   moyenne les `position`
            │                              │   des lignes voisines
            └──────────► doivent ◄─────────┘
                       COÏNCIDER

  Faire remonter les dépassées casse la coïncidence :
      rows[i-1].position  >  rows[i].position
      → (before + after) / 2  ne désigne plus rien
      → le glisser-déposer et Alt+↑/↓ atterrissent à côté
```

La réponse ne demande aucune invention : le code sépare **déjà** les épinglées
dans leur propre zone, et `planReorder` documente la règle — une épinglée se
réordonne parmi les épinglées, une ordinaire parmi les ordinaires. Les dépassées
deviennent une troisième zone construite sur ce précédent :

```
  zone 1  épinglées      ordre position    pas d'interstice   inchangée
  zone 2  en retard      ordre due_at ↑    pas d'interstice   NOUVELLE
  zone 3  ordre manuel   ordre position    interstices ✓      inchangée
```

`visibleTasks` et `pinnedTasks` ne bougent pas : elles restent l'autorité de
l'ordre par `position`, dont dépend toute l'arithmétique fractionnaire. Le
découpage est appliqué **après** `buildRows`, par une fonction `splitOverdue` qui
travaille sur des lignes et non sur des cartes — une paire dont une seule carte
est dépassée doit rester entière plutôt que de se fendre entre deux zones.
`insertPosition` n'est pas touchée : la zone 3 lui est passée seule, et reste
triée par `position` comme sa précondition l'exige.

Deux mécaniques héritent gratuitement de l'ajout, parce qu'elles sont pilotées
par les clés du patch et non par une liste de colonnes : l'annulation `Ctrl+Z`
(`previousValues`) et la synchronisation temps réel (`identiques` itère les clés
de la ligne entrante, et `replica identity full` fait arriver la colonne). Une
seule chose est à tenir en double : `TASK_COLS`, dupliqué entre le store web et
celui de l'extension.

Reste le recalcul sans rechargement, qui n'a aucun précédent — le dépôt ne
contient pas un seul `setInterval`. Un `useNow` de 60 s, doublé d'une écoute de
`visibilitychange` parce qu'un portable qui a dormi ne reçoit aucun tick. Ce
minuteur est **strictement d'affichage** : `useCompletion.ts` ouvre sur une mise
en garde de vingt lignes contre les minuteurs qui écrivent, et elle vaut ici.

## Impacts UX

L'échéance se pose là où se posent déjà les liens et les étapes : le menu `⋯`.
Une tâche sans échéance n'affiche rien du tout — même règle que les pièces
jointes (#78), dont le composant rend `null` plutôt qu'un emplacement vide. Le
badge n'apparaît que lorsqu'il y a quelque chose à dire.

```
  ┌─ Faire ─────────────────────────────────┐
  │ ⚑ Rappeler le notaire               ⋯  │   zone 1 — épinglée
  ├─────────────────────────────────────────┤
  │   Devis Martin        ⏰ en retard   ⋯  │   zone 2 — rouge,
  │   Relance facture     ⏰ en retard   ⋯  │   pas de poignée ⠿
  ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌─┤
  │ ⠿ Relire la PR        ⏰ dans 3 h    ⋯  │   zone 3 — « bientôt »
  │ ⠿ Appeler le banquier                ⋯  │   ordre manuel intact
  └─────────────────────────────────────────┘

  menu ⋯ :  Renommer
            ↑ Monter        Alt+↑
            ↓ Descendre     Alt+↓
            ↗ Attacher un lien
            ⏰ Fixer une échéance      ← nouvelle entrée, avec les
            ─────────────────────         gestes qui enrichissent la tâche
            Déplacer vers…

  éditeur (sous la carte, comme le champ de lien) :
  ┌─────────────────────────────────────────┐
  │ [ 03/09/2026 ▾ ] [ 18:30 ]  Enregistrer │
  │ Retirer l'échéance                      │
  └─────────────────────────────────────────┘
```

Trois points d'attention :

**La perte des flèches.** Une tâche qui passe dans le rouge perd ses `↑`/`↓` et sa
poignée de glissement. Ce n'est pas un bug à masquer : c'est la conséquence
visible de « les dépassées remontent d'office », et l'interface doit la rendre
lisible plutôt que de laisser des boutons qui ne feraient rien.

**La couleur ne porte pas seule l'information.** Le rouge `#a63d2a` — déjà celui
de l'encre « éliminer » et des erreurs de saisie — signale l'état, mais le badge
porte aussi son texte (« en retard », « dans 3 h »). Un daltonien lit le même
message. Le badge est un `<time dateTime="…">`, premier du dépôt, pour que la
date brute reste accessible aux technologies d'assistance derrière le libellé
relatif.

**Le libellé relatif doit rester honnête.** « dans 3 h », « demain », « dans 4 j »
se lisent d'un coup d'œil ; au-delà d'une semaine, l'écart relatif ne veut plus
rien dire et le badge bascule sur la date absolue (« le 14 mars »).
