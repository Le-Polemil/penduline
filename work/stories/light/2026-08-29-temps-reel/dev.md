---
slug: "temps-reel"
title: "Synchronisation temps réel (#39)"
issues: [39]
created: 2026-08-29
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : publication realtime et `replica identity full` | Terminé | 2026-08-29 |
| 2. `data/useRealtime.ts` : abonnement, fusion, reconnexion | Terminé | 2026-08-29 |
| 3. `store.ts` : branchement et règle d'admission en mémoire | Terminé | 2026-08-29 |
| 4. Vérifications automatiques | Terminé | 2026-08-29 |
| 5. Validation à deux onglets (10 points) | Terminé | 2026-08-29 |
| 6. Commit, push et PR fermant #39 | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-08-29 : publication, abonnement, fusion

**Statut** : Terminé

**Actions réalisées** :
- Migration `20260829140000_realtime.sql` : les trois tables ajoutées à
  `supabase_realtime`, plus `replica identity full`.
- `data/useRealtime.ts` : un canal, trois abonnements filtrés `user_id`, fusion
  par comparaison, rechargement à la reconnexion.
- `store.ts` : `inWorkingSet` extraite et partagée entre le chargement et le temps
  réel ; branchement du hook.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260829140000_realtime.sql` *(nouveau)*
- `apps/web/src/data/useRealtime.ts` *(nouveau)*
- `apps/web/src/data/store.ts`

**Notes** :

**⚠️ La publication était VIDE, et c'est le vrai piège du ticket.** Le service
Realtime tourne bien — vérifié contre la production avant de planifier, il n'était
pas dans les sept services retirés du compose. Mais `supabase_realtime` ne
contenait aucune table : un client s'abonne, se connecte, reçoit `SUBSCRIBED`… et
rien d'autre. Aucune erreur, aucun symptôme, sinon l'absence de synchronisation.
C'est le genre de panne muette qui coûte une journée à celui qui ne l'a pas
cherchée.

**`replica identity full` n'est pas une optimisation.** Sans elle, un événement
DELETE ne porte que la clé primaire — et Realtime applique la RLS avant de
délivrer : sur une ligne réduite à son `id`, la policy `user_id = auth.uid()` n'a
rien à évaluer, et **l'événement n'est pas délivré du tout**. Purger une tâche
dans un onglet l'aurait laissée affichée dans l'autre, indéfiniment.

**L'écho est neutralisé par comparaison, pas par marquage.** Suivre les
identifiants qu'on vient d'écrire supposerait de savoir quand les oublier : trop
tôt on rate une modification distante, trop tard on l'ignore. Comparer champ à
champ et rendre la MÊME référence quand rien ne change ne se trompe jamais — et
c'est ce qui supprime le scintillement, React ne re-rendant pas un état identique.

**Deux défauts dans mon premier jet**, corrigés avant tout essai : une ref
`rejoue` utilisée sans être déclarée, et surtout un `sink` capturé dans l'effet —
il aurait figé `reload` et `admits` au premier rendu, donc le rechargement de
reconnexion aurait rappelé une fonction périmée. Passé par une ref tenue à jour.

**Le temps réel devait respecter #40.** Un INSERT distant n'entre en mémoire que
s'il appartient à l'ensemble de travail — sinon la synchronisation réintroduirait
par la fenêtre les archives que #40 a sorties par la porte. Une ligne **déjà
connue** reste suivie, elle : c'est ce qui permet de voir une tâche se faire cocher
à distance.

**La suppression d'une matrice nettoie ses tâches à la main.** `on delete cascade`
les emporte côté base, mais aucun événement ne le dit : sans ce nettoyage, elles
resteraient en mémoire, rattachées à une matrice disparue.

### 2026-08-29 : validation à deux onglets

**Statut** : Terminé

Deux onglets réels sur la même matrice, base locale.

| Contrôle | Résultat |
|---|---|
| Tâche créée dans A | apparaît dans B **sans rechargement** |
| Tâche cochée dans A | disparaît de B |
| **Suppression définitive** (SQL direct) | la ligne s'en va de B *(exige `replica identity full`)* |
| **Saisie en cours dans B** pendant que A écrit | texte **et focus** conservés |
| **Glisser en cours dans B** pendant un INSERT distant | le geste **aboutit**, la carte arrive dans « Éliminer » |
| Coupure réelle du service, écriture, rétablissement | B **se resynchronise** et récupère la tâche manquée |
| Saisie pendant le rechargement de reconnexion | **survit** — les brouillons vivent dans l'état d'écran, pas dans `tasks` |

**À signaler** : couper le service produit une erreur `502` en console, émise par
le navigateur au niveau WebSocket. L'application ne peut pas la faire taire — ce
n'est pas une exception qu'elle lève, c'est le handshake qui échoue.

`npm test` : 100 + 21 · `typecheck` ✅ · `build` ✅
