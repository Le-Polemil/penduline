---
slug: "temps-reel"
title: "Synchronisation temps réel (#39)"
issues: [39]
pr: 84
created: 2026-08-29
status: "Done"
---

# #39 — Synchronisation temps réel

## Contexte

Le store charge **une seule fois au montage** et ne se rafraîchit jamais. Deux
onglets, ou le web et l'extension côte à côte, divergent donc en silence : chacun
travaille sur sa copie, et la dernière écriture écrase l'autre sans que personne
ne le voie. C'est l'usage que le produit promet — « accessible sur n'importe quel
appareil » — donc le scénario le plus probable, pas un cas limite.

### Vérifié avant de planifier

**Le service Realtime tourne en production.** Le dégraissage du compose avait
retiré sept services ; celui-ci n'en faisait pas partie, et son point d'entrée
répond (il refuse proprement une requête non-WebSocket).

**Mais la publication `supabase_realtime` est vide.** Aucune table n'y est
déclarée : sans migration, l'abonnement se connecterait et ne recevrait
strictement rien. C'est le genre de panne muette qui coûte une journée.

---

## Décisions

**`replica identity full` sur les trois tables.** Sans elle, un événement DELETE
ne porte que la clé primaire — et la RLS, qui doit évaluer `user_id = auth.uid()`,
n'a alors rien à évaluer : **l'événement n'est pas délivré**. Une purge dans un
onglet resterait invisible dans l'autre. Le coût est un WAL plus lourd, acceptable
à ce volume.

**Un seul canal, trois abonnements.** `tasks`, `boards`, `universes` — filtrés
`user_id=eq.<id>` côté serveur, en plus de la RLS. Le filtre évite de réveiller le
client pour des lignes qu'il n'a pas le droit de voir.

**La fusion respecte #40.** Le store ne garde en mémoire que `!done && !deleted`
(plus la corbeille chargée à la demande). Un INSERT distant n'entre donc que s'il
appartient à cet ensemble, ou si sa matrice a déjà sa corbeille chargée. Sans cette
garde, le temps réel réintroduirait par la fenêtre ce que #40 a sorti par la porte.

**L'écho de ses propres écritures est ignoré par COMPARAISON, pas par
marquage.** Suivre les identifiants qu'on vient d'écrire supposerait de savoir
quand les oublier — trop tôt on rate une modification distante, trop tard on
l'ignore. Comparer champ à champ ne se trompe jamais : si la ligne reçue est
identique à celle qu'on a, on ne touche pas à l'état, donc pas de re-rendu.

**Reconnexion ⇒ rechargement complet.** Pendant une coupure, les événements sont
perdus : les rejouer est impossible, donc on repart de la vérité. C'est aussi le
seul moyen de rattraper ce qui s'est passé pendant une mise en veille.

---

## Ce qui ne doit pas casser

**Une saisie en cours.** Les brouillons (`drafts`), le renommage en place et le
glisser vivent dans l'état LOCAL des écrans, pas dans `tasks` : un événement
distant ne peut pas les vider. Le seul risque réel est le re-rendu pendant un
glisser HTML5 — à vérifier en navigateur, pas en raisonnant.

**Le délai d'annulation.** Cocher écrit `done` + `archived` (#75) et garde la
tâche affichée par `pending`. L'écho de cette écriture ne doit rien changer :
la comparaison le garantit, la ligne reçue étant identique à l'optimiste.

---

## Tâches

### 1. Migration `20260829140000_realtime.sql`

Ajouter les trois tables à `supabase_realtime`, poser `replica identity full`.

> ⚠️ **À appliquer en production avant le front.** Sans elle, l'abonnement se
> connecte et reste muet — aucune erreur, aucun symptôme, sinon l'absence de
> synchronisation.

### 2. `apps/web/src/data/useRealtime.ts`

Un hook : abonnement, fusion, reconnexion. Il reçoit les *setters* du store et
`reload`, pas le store entier — pour ne pas se re-souscrire à chaque rendu.

Trois formes d'événement, trois règles :

```
INSERT  → ajouter, mais SEULEMENT si la ligne appartient à ce qu'on garde
UPDATE  → remplacer si elle diffère ; sinon ne rien faire (écho)
DELETE  → retirer
```

### 3. `apps/web/src/data/store.ts`

Brancher le hook. Exposer de quoi décider si une tâche entre en mémoire — la même
règle que le chargement, écrite une fois.

### 4. Extension

**Hors périmètre, et le ticket l'admet** : le popup charge à chaque ouverture, sa
durée de vie se compte en secondes. Il est déjà synchronisé par construction. À
dire dans la PR plutôt qu'à laisser deviner.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

### Plan de test — **deux onglets côte à côte**

C'est le seul test qui vaille ici ; le reste se déduit.

1. Créer une tâche dans A → elle apparaît dans B, **sans rechargement**
2. Cocher dans A → elle disparaît de B, et le compteur de B suit
3. Renommer dans A → le titre change dans B
4. Supprimer, puis **purger** dans A → la ligne s'en va de B *(le cas qui exige
   `replica identity full`)*
5. Créer une **matrice** et un **univers** dans A → présents dans B
6. **Taper dans le champ d'ajout de B** pendant que A écrit → la saisie survit
7. **Glisser une carte dans B** pendant que A écrit → le glisser aboutit
8. Cocher dans A, **annuler dans A** → B revient à l'état d'origine
9. Couper le réseau de B, agir dans A, rétablir → B **se resynchronise**
10. Aucun scintillement sur ses propres écritures

### Livraison

Branche `story-light/temps-reel` depuis `story-light/recherche` — troisième de la
pile, #40 et #45 n'étant pas encore mergées. PR assignée à `@me`, fermant **#39**.
