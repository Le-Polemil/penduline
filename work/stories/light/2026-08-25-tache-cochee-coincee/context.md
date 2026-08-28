---
slug: "tache-cochee-coincee"
title: "La tâche cochée qui ne part jamais (#75)"
issues: [75]
created: 2026-08-25
---

# Contexte

## Description fonctionnelle

Cocher une tâche déclenche aujourd'hui deux écritures espacées de quatre
secondes : `done` tout de suite, `archived` à l'expiration du délai d'annulation.
Le minuteur qui porte la seconde ne survit pas au démontage de l'écran. Il suffit
donc de revenir à l'accueil, de recharger, de fermer l'onglet ou de basculer sur
une autre application pendant ces quatre secondes pour que `done: true` reste en
base sans que `archived: true` ne soit jamais écrit. Comme la règle d'affichage ne
masque une tâche que lorsque les deux drapeaux sont posés, la tâche reste alors
visible dans sa case, cochée, définitivement : recharger n'y change rien, et
recocher ne fait que la décocher. L'utilisateur se retrouve avec une tâche ni
ouverte ni terminée, sans aucun geste à sa disposition pour s'en débarrasser.
C'est un état intermédiaire persisté alors qu'il ne devrait exister qu'en
mémoire, et il pollue la grille de façon irréversible.

La correction porte sur trois points. La règle d'affichage masque désormais sur
`done` seul, sans exiger `archived` : une tâche cochée n'a plus rien à faire dans
sa case, que son archivage ait été écrit ou non. En contrepartie obligatoire, la
corbeille liste `done && !deleted` — sans quoi une tâche coincée deviendrait
invisible *et* irrécupérable. Le geste de cocher n'écrit plus qu'une fois,
`{ done: true, archived: true }`, et le délai d'annulation vit entièrement en
mémoire : l'écran continue d'afficher la tâche parce qu'il la sait en attente,
plus parce que la base la déclare non archivée. Enfin, comme l'archivage devient
immédiat, la dissociation de paire qu'il entraîne l'est aussi ; l'annulation doit
donc restaurer le `pair_id` des deux côtés, sous peine de casser en silence
l'invariant d'appairage.

Le périmètre se limite au web : la règle de visibilité partagée, le hook de
complétion et les points de rendu de la matrice et de la vue globale.
L'extension n'est pas touchée — elle écrivait déjà les deux drapeaux d'un coup et
filtrait déjà sur `!done` ; c'est le web qui vient s'aligner sur elle, ce qui
referme au passage l'écart où une même tâche était invisible d'un côté et
éternelle de l'autre. Aucune migration, aucune écriture au chargement : les
données existantes ne sont pas retouchées.

**Critères d'acceptation**

- Cocher une tâche puis recharger immédiatement : elle est rangée, pas coincée.
- Cocher puis revenir à l'accueil dans les 4 s : idem.
- « Annuler » dans le délai remet la tâche en place, comme aujourd'hui —
  appairage compris.
- Les tâches déjà coincées disparaissent de la grille. Ce critère est satisfait
  par la règle d'affichage elle-même, pas par une passe de réparation : dès lors
  que `done` suffit à masquer, une tâche `done && !archived` cesse de s'afficher
  sans qu'on ait à réécrire quoi que ce soit. Elle reste retrouvable dans
  « Terminées », et « Rétablir » la normalise.
- Web et extension s'accordent sur ce qui est affiché.
- Les compteurs de l'accueil restent justes pendant le délai d'annulation.

## Vue architecturale

Trois couches se partagent le cycle « cocher », et le défaut naît de leur
désaccord sur *qui* détient l'état intermédiaire.

```
   packages/shared/layout.ts          apps/web/data/useCompletion.ts        apps/web/screens/
   ─────────────────────────          ──────────────────────────────        ─────────────────
   isVisible / visibleTasks           onCheck → complete → archive|undo     Matrix.tsx  (grille + corbeille)
   pinnedTasks / countOpen            minuteur d'annulation                 Global.tsx  (vue globale + corbeille)
   groupTasksByBoard  ────────┐       planPairDetach ──────────┐
   planPairDetach             │                                │
                              └──── règle de visibilité ───────┴──→ ce que l'écran affiche
```

`layout.ts` est l'unique autorité sur « cette tâche a-t-elle sa place dans sa
case ». Les écrans ne décident rien : ils appellent `visibleTasks` /
`pinnedTasks` directement ou indirectement via `groupTasksByBoard`, et listent
leur corbeille avec un prédicat écrit en clair. `useCompletion` est le seul
écrivain du cycle, partagé par les deux écrans depuis qu'une seconde copie du
minuteur aurait dérivé. Et `apps/extension` applique déjà sa propre règle,
`!done`, sans passer par `layout.ts` — c'est la divergence dont le symptôme
dérivé est fait.

### Un état intermédiaire qui redevient mémoire

```
AVANT — l'état intermédiaire est en base, le minuteur en est le seul garant

 clic                                                        t+4s
  │                                                            │
  ├─ write { done:true } ──────────────────────────────────────┼─ write { archived:true } + détache la paire
  │                                                            │
  └── minuteur ════════════════════════════════════════════════┘
              ╳ démontage (retour accueil, rechargement, onglet fermé)
              → le minuteur meurt, la base reste sur { done:true, archived:false }
              → isVisible masque sur (done && archived) : la tâche reste affichée. Pour toujours.

APRÈS — l'état intermédiaire est en mémoire, la base est déjà à l'état final

 clic                                                        t+4s
  │                                                            │
  ├─ write { done:true, archived:true, pinned:false } + détache la paire (UNE écriture)
  │                                                            │
  └── pending (mémoire) ═══════════════════════════════════════┘ le minuteur ne fait que vider `pending`
              ╳ démontage
              → `pending` disparaît avec l'écran : la base est déjà cohérente, rien à rattraper
```

Le point à retenir est de nature, pas de degré : le correctif ne cherche pas à
**faire survivre** le minuteur (persistance de l'échéance, rejeu au chargement,
passe de rattrapage au démarrage — toutes des réponses au mauvais problème). Il
lui **retire sa responsabilité**. Un minuteur qui ne porte plus qu'un nettoyage
d'état local peut mourir n'importe quand sans conséquence ; c'est précisément ce
qui rend le nettoyage au démontage acceptable au lieu de destructeur.

### Masquer sur `done` seul : le symptôme devient inatteignable

```
                       │ done  │ archived │ AVANT (done && archived)   │ APRÈS (done)
  ─────────────────────┼───────┼──────────┼───────────────────────────┼──────────────
  tâche ouverte        │ non   │    —     │ visible                   │ visible
  tâche cochée, en vol │ oui   │  oui     │ visible (car !archived ✗) │ masquée, sauf `pending`
  tâche rangée         │ oui   │  oui     │ masquée                   │ masquée
  tâche COINCÉE        │ oui   │  non     │ visible à jamais ← le bug │ masquée
```

Faire porter le masquage au seul `done` supprime la ligne « coincée » du tableau :
il n'existe plus de combinaison de drapeaux capable d'afficher une tâche cochée à
demeure. La correction est donc **par construction**, pas par réparation — les
données déjà abîmées disparaissent de la grille au premier rendu, sans migration,
sans écriture au chargement, sans passe de rattrapage à écrire, tester et
maintenir. Elle aligne au passage le web sur l'extension : une donnée, une règle.
`countOpen` filtre déjà sur `!done` et reste inchangé.

Le prix à payer est une **obligation en miroir**, et il n'est pas optionnel :
`archived` cessant d'être le critère d'affichage, il ne peut pas rester le critère
de récupération. La corbeille doit lister `done && !deleted`. Sans ce second
changement, une tâche coincée sortirait de la grille sans entrer dans
« Terminées » : invisible *et* irrécupérable, un défaut pire que celui qu'on
corrige. `onRestore` écrivant déjà les trois drapeaux, restaurer une tâche coincée
la normalise au passage — la corbeille devient le chemin de réparation, à la
demande de l'utilisateur, plutôt qu'une routine automatique.

### Le piège de l'appairage

`planPairDetach` est le seul endroit qui rompt un lien, et il le rompt **des deux
côtés** — un `pair_id` orphelin fausserait toute recherche de partenaire.
Aujourd'hui il n'est appelé qu'à l'expiration du minuteur : la dissociation arrive
après le délai, donc l'annulation, qui joue *avant*, n'a jamais eu à s'en soucier.

```
AVANT                                   APRÈS
 clic ──── paire intacte ──── t+4s       clic ──── paire DÉJÀ dissociée ──── t+4s
              │                 │                       │
           undo ici :        détache                 undo ici : { done:false, archived:false }
        rien à restaurer                             ne restaure RIEN → paire cassée, en silence
```

Rendre l'archivage immédiat déplace l'annulation **du bon côté du détachement**.
Un `undo` qui ne réécrirait que `{ done: false, archived: false }` laisserait les
deux `pair_id` à `null` : la paire survivrait à l'œil — deux cartes toujours
présentes — mais aurait perdu son lien, soit exactement l'invariant que #51 et #60
ont coûté cher à établir, et le genre de rupture silencieuse qu'aucun test
d'affichage n'attrape. `pending` porte donc, en plus de quoi afficher la tâche,
**de quoi défaire l'écriture** : l'identité de la tâche, celle de sa partenaire,
et le `pair_id` d'origine.

Dernier garde-fou de portée : seuls les **trois points de rendu** reçoivent
`pending`. Les nombreux autres appels à `visibleTasks` calculent des positions
d'insertion — une tâche en partance ne doit pas y peser, sous peine de servir de
repère à un voisin qu'elle va quitter.

## Impacts UX

En usage nominal, rien ne bouge à l'écran. On coche, la tâche reste en place,
barrée, pendant quatre secondes ; un toast propose « Annuler » ; passé le délai
elle rejoint « Terminées ». Ce qui change est sous la ligne de flottaison : la
tâche reste affichée parce que l'écran sait qu'elle est *en attente*, non plus
parce que la base la déclare encore non archivée. L'annulation restaure la
position et, désormais, l'appairage. Le geste, sa durée et sa réversibilité sont
identiques à ce que l'utilisateur connaît.

```
clic                                                    +4 s
 |                                                        |
 v                                                        v
[écriture done+archived]......... 4 s d'attente .........[fin du délai]
 |                                                        |
 |  grille : tâche affichée, barrée (parce que pending)   |  grille : rangée
 |  toast  : « … terminée »  [Annuler]                    |  toast  : disparu
 |  corbeille (si ouverte) : déjà listée                  |
 |                                                        |
 +-- rechargement / retour accueil ici --> rangée, récupérable dans « Terminées »
     (avant : coincée dans la grille, pour toujours)
```

Ce qui change vraiment, c'est le sort d'une tâche cochée puis abandonnée : quitter
l'écran, recharger ou fermer l'onglet dans les quatre secondes la laisse
**rangée** et non plus coincée, et elle reste récupérable dans « Terminées » par
« Rétablir ». Corollaire assumé : les tâches déjà coincées disparaissent de la
grille au premier chargement, sans migration ni prévenance. Pour qui en a
accumulé plusieurs, c'est un changement visible — des lignes barrées présentes
depuis des semaines ne seront plus là. Elles ne sont pas perdues : la corbeille
liste désormais `done && !deleted`, donc elles apparaissent toutes dans
« Terminées », d'où on peut les remettre en place. Le compromis est explicite :
disparition immédiate et sans explication d'un côté, contre récupération à un clic
de l'autre. Il paraît meilleur que le statu quo, où la seule issue était de vivre
avec.

Point de vigilance : pendant les quatre secondes, la tâche est réellement
archivée en base tout en restant affichée. Ouvrir la corbeille dans ce court
intervalle la montre donc à la fois barrée dans la grille et listée dans
« Terminées ». C'est acceptable — la fenêtre est de quatre secondes et suppose
d'ouvrir la corbeille pendant qu'un toast d'annulation est encore visible ; les
deux affichages disent la même chose (« c'est fait, tu peux revenir en arrière ») ;
et une annulation remet tout d'aplomb des deux côtés. L'incohérence apparente est
le prix d'un état d'attente qui n'existe plus qu'en mémoire, ce qui est
précisément l'objet du correctif. Côté accessibilité, rien de nouveau à annoncer :
le toast passe par l'hôte commun avec `role="status"`, il énonce déjà
« « … » terminée » et expose le bouton « Annuler » au clavier.
