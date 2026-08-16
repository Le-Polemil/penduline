---
story: "Harnais de test"
story_code: "harnais-de-test"
issues: [31]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Cette story ne livre rien de visible. Elle protège ce qui a été livré.

Le dépôt n'a **aucun test**. La seule commande qualité est `npm run typecheck`, et
la CI ne lance rien d'autre. C'était défendable tant que tout se vérifiait à
l'écran : une couleur fausse, un bouton absent, un menu qui ne s'ouvre pas se
voient immédiatement. Ce n'est plus la situation. Trois stories consécutives
viennent d'ajouter de la logique dont les défaillances sont **silencieuses** — elles
ne lèvent pas d'erreur, ne cassent pas l'affichage, et produisent simplement un
résultat faux.

Trois exemples concrets, tous issus de code écrit cette semaine. Les positions
fractionnaires servent désormais à deux ordres différents (tâches et matrices) et
se resserrent à chaque insertion : passé un certain nombre, deux positions
deviennent égales et l'ordre cesse d'être défini, sans le moindre signal. L'invariant
d'appairage — *une paire reste ensemble* — repose sur du code défensif que rien ne
vérifie. Et cette préservation existe maintenant **en deux exemplaires**, web et
extension, sans que rien ne garantisse qu'ils restent d'accord.

Le résultat attendu n'est donc pas un chiffre de couverture, mais une réponse à une
question qu'aucune relecture ne peut donner : **combien d'insertions consécutives
au même endroit le schéma supporte-t-il avant que l'ordre ne se défasse ?**

## Vue architecturale

Rien de structurel, mais deux décisions d'outillage qui engagent la suite.

```
  racine/
    vitest.base.ts      ← configuration commune
    package.json        ← npm test = --workspaces --if-present
       │
       ├── packages/shared/vitest.config.ts   (mergeConfig)
       ├── apps/web/            ← rien aujourd'hui, prêt demain
       └── apps/extension/      ← idem
```

**La base vit à la racine, pas dans `packages/shared`.** Une configuration commune
ne doit pas appartenir à l'un de ses consommateurs : le jour où le web voudra
tester sa logique non-React, il n'aura pas à importer un fichier depuis un paquet
qui n'a rien à voir avec lui.

**`npm test` reprend exactement le motif de `typecheck`** —
`npm run test --workspaces --if-present`. Les workspaces sans tests sont ignorés
sans erreur, et la commande racine les couvrira d'elle-même dès qu'ils en auront.
Aucune liste à tenir à jour, donc aucune liste à oublier de mettre à jour.

**`environment: 'node'` par défaut.** `layout.ts` est de la logique pure : imposer
`jsdom` ferait payer un environnement de navigateur complet à des tests qui n'en
ont aucun usage. Web et extension pourront le surcharger localement.

**L'étape CI se place entre `Typecheck` et `Build`**, et doit faire échouer le
workflow. Un harnais qui ne peut pas faire rougir la CI ne protège de rien — c'est
pourquoi le plan prévoit de le vérifier en cassant volontairement une assertion.

**Aucune modification du code de production.** C'est délibéré : si un test échoue,
c'est une découverte sur le comportement réel, pas une régression introduite par
la story.

## Impacts UX

Aucun impact UX identifié pour cette story — elle ne touche à aucune interface.

Un effet indirect mérite toutefois d'être noté : les tests de la matrice d'états
figent des règles qui **portent des décisions d'expérience**, et qui n'étaient
écrites nulle part. Qu'une tâche cochée reste visible tant qu'elle n'est pas
archivée, par exemple, n'est pas un détail d'implémentation : c'est le délai
d'annulation de quatre secondes, une décision produit. La table de test devient le
seul endroit où cette règle est énoncée explicitement.
