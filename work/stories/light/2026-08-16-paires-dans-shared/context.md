---
story: "Préservation des paires dans shared"
story_code: "paires-dans-shared"
issues: [60]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Cette story ne change rien pour l'utilisateur. C'est délibéré, et c'est le critère
d'acceptation principal : **comportement strictement inchangé**, web comme
extension.

Ce qu'elle change, c'est le nombre d'endroits où la règle est écrite. L'invariant
« une paire reste ensemble » existe aujourd'hui en **deux copies identiques au
caractère près**, l'une dans l'écran matrice du web, l'autre dans le popup. Rien
ne garantit qu'elles restent d'accord, et aucune n'est vérifiable — elles vivent
dans des composants React, hors d'atteinte du harnais de tests.

L'histoire du produit dit assez pourquoi c'est urgent, parce qu'elle s'est déjà
produite. #51 a corrigé la casse silencieuse des paires côté web ; il a fallu
attendre #12/#13, plusieurs jours plus tard, pour découvrir que **l'extension
reproduisait toujours le même défaut**. Le bug avait été corrigé dans la copie
qu'on regardait, et oublié dans l'autre. La duplication actuelle a quelques jours :
c'est le moment où elle coûte le moins cher à résorber.

La story emporte aussi la correction d'un défaut trouvé en relisant — le décalage
fixe qui place la partenaire d'une paire déplacée, et qui peut la faire atterrir
au-delà de sa voisine. Il sera corrigé dans un **commit séparé** de l'extraction.

## Vue architecturale

Le point de conception tient en une phrase : **la fonction partagée ne persiste
rien**.

```
  AVANT                                  APRÈS
  ─────                                  ─────
  Matrix.tsx                             layout.ts
    movePair() ──▶ patchTask()             planPairMove()   ─┐  rendent des
                                           planPairDetach() ─┘  patchs
  App.tsx (extension)                            ▲
    movePair() ──▶ patchTask()                   │
                                        ┌────────┴────────┐
    (deux copies identiques)            Matrix.tsx    App.tsx
                                        applique      applique
```

Elle prend les tâches et rend **ce qu'il y a à écrire** — une liste de
`{ id, patch }` — à charge de l'appelant de la passer à son propre `patchTask`.
C'est cette inversion qui la sort de React et de Supabase, donc qui la rend
testable. Le préfixe `plan…` le dit dans le nom, pour qu'aucun futur lecteur ne
s'attende à un effet de bord.

**Une parenté que la dispersion cachait.** `unpair()`, `archive()` et
`removeTask()` faisaient chacun la même chose sans en avoir l'air : mettre
`pair_id` à `null` des deux côtés, en ajoutant au passage un patch propre à la
tâche qui part. Une seule fonction, `planPairDetach`, couvre les trois. Ce
regroupement n'est pas un effet du refactoring, c'est ce que le refactoring
révèle.

Chaque appelant garde ce qui lui appartient : `withVT`, `setMenuTask`,
`setPending` n'ont rien à faire dans `shared`. La frontière passe exactement entre
« quoi écrire » et « comment le montrer ».

**Impact sur l'existant** : nul en base, nul sur les policies, nul sur l'interface.
C'est le premier refactoring du dépôt à être **protégé avant d'être entrepris** —
les 24 tests de #31 couvrent déjà `partnerOf` et `buildRows`, donc une extraction
qui casserait l'appairage se verrait immédiatement.

## Impacts UX

Aucun impact UX attendu, et c'est le critère d'acceptation : si quelque chose
change à l'écran, c'est un défaut de l'extraction.

Une nuance toutefois, portée par le second commit. Le décalage fixe de `+0,001`
pouvait placer la seconde moitié d'une paire **au-delà de sa voisine** — la paire
se retrouvait alors à cheval sur une autre tâche, visuellement disloquée. Le
scénario demande une dizaine de réordonnancements au même interstice, donc il est
rare ; mais quand il survient, l'utilisateur voit une paire cassée sans avoir rien
fait qui l'explique. La correction supprime ce cas.
