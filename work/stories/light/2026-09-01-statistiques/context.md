---
story: "Statistiques rétrospectives par case"
story_code: "statistiques"
issue: 48
created: 2026-09-01
---

# Contexte

## Description fonctionnelle

La matrice d'Eisenhower ne sert pas à ranger, elle sert à constater. Sa promesse tient en une
phrase — *tu passes ton temps dans l'urgent, pas dans l'important* — et Penduline ne l'a
jamais tenue : l'outil permet de classer, puis se tait. Un utilisateur peut cocher trois cents
tâches sans jamais apprendre que les deux tiers venaient de *Faire*.

La valeur livrée est un écran rétrospectif qui rend ce constat, sur une période choisie
(30 jours, 3 mois, 12 mois) : la répartition des tâches terminées par case, la tendance
semaine après semaine, le délai moyen entre création et complétion par case, la comparaison
entre matrices, et **au moins un constat formulé en clair**. Ce dernier point n'est pas
décoratif : un graphique se regarde, une phrase se retient.

Le différenciateur est réel et bon marché. Les listes de tâches comptent ce qui est fait ;
aucune ne dit dans quel quadrant on vit. Toute la matière existe déjà en base — il ne manque
que la lecture.

Le périmètre s'arrête à la lecture. Aucune écriture, aucune action, aucun objectif à se fixer,
aucune série à entretenir : ce n'est pas un tableau de bord de productivité, c'est un miroir
rétrospectif. Deux garde-fous en découlent — le ton reste descriptif (le produit n'a pas
vocation à noter son utilisateur), et un compte jeune reçoit un état initial soigné qui
explique ce qui viendra plutôt qu'une série d'axes vides.

Critères d'acceptation : les cinq lectures présentes et concordantes, un état initial soigné,
la lisibilité sur mobile, et la sortie assumée des tâches purgées ou supprimées — dite à
l'écran, sinon les totaux paraîtront faux.

## Vue architecturale

**Contrainte fondatrice : il n'y a rien à calculer côté client.** Depuis #40, `store.tasks`
ne contient que les tâches ouvertes ; or ce ticket ne parle que de tâches terminées. Ce n'est
pas cent pour cent serveur par choix d'optimisation, c'est cent pour cent serveur par
nécessité — contrairement à #47, où trois signaux sur cinq se calculaient en mémoire.

**Découverte qui supprime une migration.** Le correctif de #75 a réglé sans le savoir la
question de la date de complétion. Cocher n'est plus qu'une seule écriture, portant `done` et
`archived` ensemble, immédiate :

```
  avant #75 :  clic ──► done=true ─────4 s────► archived=true
                        (updated_at)            (updated_at écrasé)

  depuis #75 :  clic ──► done=true, archived=true, pinned=false
                         (une écriture, un seul updated_at)
```

Donc pour une tâche `done`, `updated_at` **est** l'instant de complétion, exactement. Là où
#47 se heurtait à une donnée indécidable — `updated_at` conflatait toutes les colonnes — #48
dispose d'une donnée exacte par construction. Ajouter un `completed_at` dupliquerait ce que la
base sait déjà.

**Forme du transport : un objet, pas une table.** `config.toml` porte `max_rows = 1000`, et ce
plafond frappe aussi les fonctions renvoyant un `setof`, en silence — c'est le piège de #40.
Une table de faits `semaine × matrice × case` sur un an d'usage actif s'en approche et serait
tronquée sans erreur : des statistiques fausses, muettes. Une fonction renvoyant `jsonb` tient
dans une ligne, hors de portée du plafond.

```
   navigateur                     Postgres
   ──────────                     ────────
   useStats() ──── rpc ──────►  completion_stats(since)
                                  │  RLS de tasks (security invoker)
                                  │  done and not deleted and parent_id is null
                                  ▼
              ◄──── 1 ligne ──  jsonb { by_quadrant, by_week, by_board }
        │
        ▼
   parseCompletionStats()   ← validation défensive : le jsonb n'a pas de typage
        │                     à la frontière
        ▼
   statsReadings()          ← pur, testé, `now` injecté
        │
        ▼
   Stats.tsx                ← rend, ne calcule pas
```

**Décision qui protège la justesse : des sommes, jamais des moyennes.** La fonction rend
`age_seconds_total` et `completed`, pas une moyenne. Une moyenne pré-calculée interdit tout
regroupement ultérieur — moyenner des moyennes de tailles inégales donne un résultat faux, et
faux d'une manière que personne ne remarque jamais. En transportant la somme et le compte, le
client regroupe par case, par matrice ou par période sans se tromper.

**Impact sur l'existant : quasi nul.** Un membre de plus au type `View`, une entrée sur
l'accueil, aucune modification du store, du temps réel ni de la corbeille. Aucune dépendance
ajoutée : les graphiques sont du SVG écrit à la main, dans la palette déjà en place
(`quadrants.ts`), que `contrast.test.ts` vérifie.

## Impacts UX

Un écran de premier niveau, atteint depuis l'accueil, dont la lecture doit se faire de haut en
bas : d'abord la phrase, ensuite les graphiques qui la fondent. L'ordre inverse — les
graphiques d'abord — obligerait chacun à faire lui-même le travail d'interprétation, ce qui est
précisément ce que l'écran est censé livrer.

```
  ┌─────────────────────────────────────────────────────┐
  │  Rétrospective          [30 j] [3 mois] [12 mois]   │
  ├─────────────────────────────────────────────────────┤
  │  « 60 % de ce que vous avez terminé ce mois-ci      │
  │    venait de Faire. C'est la case de l'urgence —    │
  │    beaucoup de choses vous arrivent avant d'être    │
  │    planifiées. »                                     │
  ├─────────────────────────────────────────────────────┤
  │  Par case                                            │
  │  Faire      ████████████████████░░░░░  62 %   47    │
  │  Planifier  ██████░░░░░░░░░░░░░░░░░░░  19 %   14    │
  │  Déléguer   ████░░░░░░░░░░░░░░░░░░░░░  12 %    9    │
  │  Éliminer   ██░░░░░░░░░░░░░░░░░░░░░░░   7 %    5    │
  ├─────────────────────────────────────────────────────┤
  │  Semaine après semaine                               │
  │   12 ┤      ▟▙                                       │
  │    8 ┤   ▟▄▟██▙   ▟▙                                 │
  │    4 ┤ ▄▟███████▄▟██▄▖   ▗▄▟▙                        │
  │    0 ┼─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴                       │
  ├─────────────────────────────────────────────────────┤
  │  Délai moyen avant complétion                        │
  │  Faire       1,2 j                                   │
  │  Planifier  18,0 j     ← lent, et c'est normal       │
  ├─────────────────────────────────────────────────────┤
  │  Par matrice                                         │
  └─────────────────────────────────────────────────────┘
```

Trois partis pris. **La couleur porte le sens, jamais seule** : chaque barre est étiquetée et
chiffrée, donc lisible sans distinguer les teintes — les quatre couleurs de case ne sont pas
choisies pour être discriminables entre elles, elles sont choisies pour s'accorder au thème.
**Le délai moyen est présenté sans jugement** : un *Planifier* lent est le fonctionnement
normal de la méthode, pas un retard, et l'écran doit le dire pour ne pas induire une fausse
culpabilité. **L'état d'un compte neuf est un vrai écran**, pas un graphique à zéro : « Vous
n'avez encore rien terminé sur cette période. Les statistiques se rempliront à mesure que vous
cocherez. »

Accessibilité : chaque graphique est un `figure` avec un intitulé, et son contenu est doublé
d'un tableau lisible au lecteur d'écran — un SVG de barres ne s'énonce pas. Les boutons de
période forment un groupe à état (`aria-pressed`), et non des liens. Sur mobile, les barres
horizontales survivent au rétrécissement là où des colonnes verticales deviendraient illisibles ;
la série hebdomadaire défile dans son propre conteneur plutôt que d'écraser la page.
