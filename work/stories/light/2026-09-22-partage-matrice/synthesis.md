---
story: "Partager une matrice avec quelqu'un"
story_code: "partage-matrice"
created: 2026-09-22
completed: 2026-09-22
status: "Done"
---

# Synthèse

## Résumé

#53 est livré en entier : inviter par lien, rôles lecture et écriture, attribution
visible, quitter, révoquer, et le temps réel qui tient tout ensemble.

Le ticket annonçait « le changement le plus transformateur du backlog, et de loin le plus
coûteux ». Il l'était pour une raison précise : **tout le modèle de sécurité reposait sur
une hypothèse unique** — une ligne appartient à une personne — et cette égalité était
recopiée à huit endroits (quatre policies `for all`, le filtre temps réel, et les
insertions de trois clients). Le partage l'invalide à la racine.

Depuis #117, il n'y avait plus non plus de filtre client pour masquer une policy trop
large : la RLS est le levier **unique** de la délivrance, temps réel compris. Une erreur
n'exposait plus des lectures, elle exposait un flux poussé — sans rien à l'écran.

## Décisions

| Question | Décision |
|---|---|
| Atteindre une adresse sans compte | **Lien à jeton**, transmis à la main. Aucune infra e-mail : le même chemin sert le compte existant et l'adresse inconnue. |
| Révocation sur un socket ouvert | Décidée comme un canal de diffusion dédié, puis **abandonnée** : `board_placements` portait déjà le signal, avec un filtre qui ne périme jamais. Deux mécanismes qui font la même chose divergent. |
| Édition simultanée | **Dernier écrit gagne, mais visible.** Le temps réel supprime l'écrasement *silencieux*, qui est la perte que le ticket redoutait. |
| Rangement chez l'invité | **Dans SES univers** → `universe_id` et `position` quittent `boards` pour `board_placements`. |

## Changements réalisés

**Six migrations.** Appartenance (`board_members`, `peut_lire`/`peut_ecrire`/`est_membre`
en `security definer`, **16 policies** remplaçant les 4 `for all`, `task_attachments.board_id`)
· rangement par personne · attribution (`author_id`, `completed_by`, correctif
`completion_stats`, quatre index reconstruits) · invitations · `membres_matrice` ·
publication de `board_members`.

**Temps réel conforme à l'accès** dans `packages/shared/src/realtime.ts` : filtres
`board_id=in.(…)` découpés en tranches de 100, réabonnement piloté par les placements,
rechargement derrière.

**Interface** : modale de partage, écran d'acceptation, pastille « partagée », attribution
sur les cartes, refus de lecture seule **motivés**, annonces `aria-live`.

**Les trois clients alignés** : web, extension (format d'instantané v2 → v3), serveur MCP.

## Ce que l'écriture a révélé, et que le plan n'avait pas vu

1. **Une policy `select` qui doit relire sa propre table ne peut jamais passer sur un
   `insert … returning`.** `peut_lire(id)` sur `boards` cherchait la ligne que
   l'instruction était en train d'insérer. Trouvé par la suite de tests, dès son premier
   passage. Le cas du propriétaire se tranche désormais **sur la ligne elle-même**.
2. **Une tâche déplacée vers une autre matrice laissait ses liens derrière** — donc
   délivrés en temps réel à qui voit l'ancienne matrice. Une fuite qui survit au
   déplacement.
3. **Realtime plafonne un filtre `in` à 100 valeurs** et LÈVE au-delà : l'abonnement
   échoue en entier, et en silence côté application.
4. **Quatre index partiels démarraient par `user_id`** pour servir l'ancienne policy que
   le planificateur poussait dans le parcours.
5. **Tout ce que le partage affiche est fait de NOMS**, et les adresses vivent dans
   `auth.users`, fermé à l'application. D'où `membres_matrice`.
6. **Un changement de rôle ne se voyait pas.** Trouvé seulement en validant à deux comptes
   dans un navigateur : un refus motivé mais FAUX, pire qu'un refus muet.

## Tests et validation

- **Typecheck** : 0 erreur. Le renommage `user_id → author_id` en avait produit **94**,
  soit un site par intention à relire — c'était son objet.
- **400 tests** automatiques, plus **31 tests live** (dont `partage.live.test.ts`, 26
  assertions à deux comptes réels : c'est le livrable de sécurité du ticket).
- **Build** vert, web et extension.
- **Validation manuelle** à deux comptes dans deux contextes de navigateur isolés :
  onze points, de la création du lien à la révocation vue à l'écran. Aucune erreur console.

## Ce qui reste hors périmètre

- Partage d'un **univers** entier (#17).
- **`focus_day` est une colonne de `tasks`**, donc une seule valeur pour tout le monde :
  sur une matrice partagée, deux personnes qui mettent la même tâche dans leur journée
  s'écrasent. Vu en reconstruisant les index, hors périmètre — mérite son propre ticket.
- **Rotation des jetons de rafraîchissement**, verrouillée par `work/session.md`.
- E-mail d'invitation automatique : le lien se partage à la main, par décision.
