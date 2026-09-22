---
story: "Partager une matrice avec quelqu'un"
story_code: "partage-matrice"
created: 2026-09-22
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 0. Spike temps réel — `realtime.send()` depuis un trigger, filtre `in.(…)` sur DELETE, longueur d'URL | Terminé | 2026-09-22 |
| 1. Migration A — appartenance (`board_members`, `peut_lire`/`peut_ecrire`, réécriture RLS, `task_attachments.board_id`) | Terminé | 2026-09-22 |
| 2. Migration B — rangement par personne (`board_placements`, backfill, retrait de `boards.universe_id`/`position`) | Terminé | 2026-09-22 |
| 3. Migration C — attribution (`author_id`, `completed_by`, correctif `completion_stats`, revue des RPC) | Terminé | 2026-09-22 |
| 4. Migration D — invitations (`board_invitations`, `accepter_invitation`) | Terminé | 2026-09-22 |
| 5. ~~Migration E — canal de révocation~~ — abandonnée, redondante avec `board_placements` | Abandonnée | 2026-09-22 |
| 6. Suite de tests RLS à deux comptes (`partage.live.test.ts`) — avant le client | Terminé | 2026-09-22 |
| 7. Temps réel conforme à l'accès (`packages/shared/src/realtime.ts` + tests unitaires) | Terminé | 2026-09-22 |
| 8. Web — store, types, modale de partage, menu matrice, écran d'invitation | Terminé | 2026-09-22 |
| 9. Attribution visible sur la carte de tâche | Terminé | 2026-09-22 |
| 10. Extension et serveur MCP — colonnes et filtres alignés | Terminé | 2026-09-22 |
| 11. Portes de qualité + validation dans un vrai navigateur, à deux comptes | Terminé | 2026-09-22 |

## Journal

### 2026-09-22 : Spike temps réel

**Statut** : Terminé

**Actions réalisées** :
- Démarrage du Supabase local (seul `supabase_db_penduline` tournait).
- Lecture du schéma `realtime` et du **code source** des fonctions `apply_rls`,
  `is_visible_through_filters`, `check_equality_op`, `subscription_check_filters`.
- Appel réel de `realtime.send()` en SQL, et vérification de l'insertion dans
  `realtime.messages`.

**Les trois questions, et leurs réponses** :

1. **`realtime.send()` depuis un trigger — OUI.** La fonction existe avec la signature
   `(payload jsonb, event text, topic text, private boolean)`, l'appel passe, et le
   message atterrit dans `realtime.messages`. Le repli côté client documenté dans le plan
   n'a pas lieu d'être : on garde le trigger.

   ⚠️ **Mais une policy manque, et son absence est silencieuse.** `realtime.messages` a
   la RLS activée et **aucune policy** : un canal privé se connecte, ne reçoit rien, et
   ne signale aucune erreur. Exactement le symptôme de la publication vide de #39. La
   policy devient une pièce à part entière de la migration E.

2. **Un filtre `in.(…)` tranche-t-il un DELETE — OUI**, et la réponse vient du mécanisme,
   pas d'une observation. Dans `realtime.apply_rls` :
   - `if is_rls_enabled and action <> 'DELETE'` → la RLS n'est **pas** évaluée pour les
     DELETE, ce qui confirme la mesure du 2026-09-08 ;
   - les filtres sont appliqués à `old_columns` autant qu'à `columns` → la ligne
     supprimée entière (grâce à `replica identity full`) est bien confrontée au filtre ;
   - `if not is_rls_enabled or action = 'DELETE'` → passer le filtre SUFFIT à être
     délivré ;
   - `check_equality_op` traduit `in` en `= any(…)` : **même chemin de code que `eq`**.

   Le levier annoncé par le plan tient donc, et pour la raison annoncée.

3. **Longueur d'un `in.(…)` — la vraie limite n'est pas l'URL.** Le filtre voyage dans la
   trame WebSocket, pas dans une URL. En revanche `realtime.subscription_check_filters`
   **plafonne un filtre `in` à 100 valeurs** et **LÈVE** au-delà
   (`too many values for `in` filter. Maximum 100`). L'abonnement échoue alors en entier :
   plus aucun temps réel, pas seulement les matrices en trop.

**Fichiers modifiés** :
- `work/stories/light/2026-09-22-partage-matrice/plan.md` (actions 5 et 7 amendées)

**Notes** : le plafond à 100 est le seul vrai changement de conception issu du spike. Le
jeu de matrices accessibles sera découpé en tranches de 100, une liaison
`on('postgres_changes', …)` par tranche sur le même canal. Un compte réel en a une
poignée — mais le mode de défaillance est total et muet, donc il se traite maintenant, pas
le jour où quelqu'un franchit le seuil.


### 2026-09-22 : Migration A — appartenance et réécriture RLS

**Statut** : Terminé

**Actions réalisées** :
- Enum `board_role`, table `board_members` (le propriétaire n'y figure pas :
  `boards.user_id` reste l'autorité), index sur le parcours inverse `(user_id)`.
- Trois fonctions `security definer` : `est_proprietaire`, `peut_lire`, `peut_ecrire`.
- `task_attachments.board_id` dénormalisé, rempli par trigger — **et** un second trigger
  `tasks_propager_board_id` pour le cas oublié du plan : une tâche déplacée vers une
  autre matrice laissait ses liens rattachés à l'ancienne, donc délivrés en temps réel à
  qui voit l'ancienne. Une fuite qui survit au déplacement.
- Les quatre policies `for all` remplacées par **16 policies**, une par verbe et par table.
- Migration appliquée à la base locale et enregistrée dans `schema_migrations`.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260922130000_partage_appartenance.sql` (nouveau)

**Validation à deux comptes** (seeds `demo@penduline.test` / `intrus@penduline.test`,
le tout dans une transaction annulée — aucun résidu en base) :

| Situation | Attendu | Obtenu |
|---|---|---|
| demo, ses matrices | 4 | 4 |
| intrus, sans partage | 0 matrice, 0 tâche | 0 / 0 |
| intrus en `lecture` | voit la matrice et ses tâches | 1 matrice, 3 tâches |
| intrus en `lecture`, insertion d'une tâche | refus | `new row violates row-level security policy` |
| intrus en `ecriture`, insertion | acceptée | acceptée |
| intrus en `ecriture`, renommage de la matrice | refus | 0 ligne touchée |

Aucune erreur de récursion : le `security definer` fait bien son office.

**Notes** :

⚠️ **Piège d'environnement, à ne pas réapprendre.** `supabase … migration up --local`
et `db reset --local` visent le port **54322**, qui est occupé par le conteneur d'un
AUTRE projet (`supabase_db_pcb-fidfe`). Le Postgres de Penduline écoute sur **55322**
(et Kong sur 55321), la CLI ayant décalé les ports au démarrage faute de trouver ceux de
`config.toml` libres. La commande a heureusement échoué sur un contrôle d'historique —
elle aurait sinon appliqué cette migration à la base d'un autre projet. Les migrations
sont donc appliquées via `docker exec -i supabase_db_penduline psql`, et la ligne de
`supabase_migrations.schema_migrations` posée à la main.

### 2026-09-22 : Migration B — le rangement devient personnel

**Statut** : Terminé

**Actions réalisées** :
- Table `board_placements (board_id, user_id, universe_id, position)`, index sur le
  parcours de l'accueil `(user_id, universe_id, position)`.
- Reprise des 4 matrices existantes en placements du propriétaire, puis
  `drop column boards.universe_id` et `boards.position`.
- Trois triggers : le placement naît avec la matrice (propriétaire), naît avec l'adhésion
  (invité, hors univers, en fin de liste), et meurt avec elle.
- Policy `for all (user_id = auth.uid())` — et cette fois la `for all` est juste : la
  table est mono-utilisateur par construction.
- Publication temps réel + `replica identity full`.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260922140000_partage_rangement.sql` (nouveau)

**Validation** (transaction annulée) : 0 placement avant partage → 1 après, `universe_id`
nul et position en fin → 0 après révocation, les 4 placements du propriétaire intacts.

**Notes** :

**Découverte : le canal de diffusion dédié est peut-être redondant.** `board_placements`
se filtre en `user_id=eq.<moi>` — un filtre stable, qui n'a jamais besoin d'être
réabonné. Or l'octroi d'un partage y fait un INSERT et la révocation un DELETE, tous
deux délivrés immédiatement à l'intéressé : le DELETE parce que le filtre est évalué sur
la ligne entière avant caviardage, et que Realtime n'évalue aucune policy pour les DELETE.
Cette table porte donc déjà le signal « une matrice est arrivée / repartie », qui est
exactement ce que la migration E devait construire.

**Tranché : la migration E est abandonnée.** Deux mécanismes qui font la même chose
finissent par diverger. La policy sur `realtime.messages` tombe avec. Renoncement assumé :
un DELETE caviardé à la clé primaire dit *quelle* matrice part, pas *pourquoi* — on ne
distingue pas « vous êtes parti » de « on vous a retiré ».

### 2026-09-22 : Migration C — attribution

**Statut** : Terminé

**Actions réalisées** :
- `tasks.user_id → author_id` et `task_attachments.user_id → author_id`, index renommés.
  Le renommage a bien emporté les expressions de policy écrites en migration A : la
  policy d'insertion dit désormais `peut_ecrire(board_id) AND author_id = auth.uid()`
  sans qu'on l'ait retouchée.
- `tasks.completed_by`, posé et effacé par le trigger `tasks_completed_at` **étendu**
  (pas doublé — les deux colonnes répondent à la même transition).
- Rattrapage `completed_by = author_id` pour les tâches déjà cochées, `tasks_updated_at`
  désactivé le temps du passage (même désamorçage qu'à la migration `completed_at`).
- **Correctif `completion_stats` : `and t.completed_by = auth.uid()`.**
- `search_tasks` et `review_boards` relus et commentés : leur élargissement aux matrices
  partagées est voulu, pas subi.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260922150000_partage_attribution.sql` (nouveau)

**Validation à deux comptes** (transaction annulée) : l'intrus en écriture coche une
tâche de la matrice partagée → `completed_by` = intrus, `completed_at` posée ; l'intrus
compte 1 dans ses statistiques, **le propriétaire compte `[]`**. C'est exactement la
fuite silencieuse que la colonne existe pour empêcher.

**Notes** :

**Un effet que le plan n'avait pas vu : quatre index partiels démarraient par `user_id`.**
Ce n'était pas un choix de requête, c'était l'ancienne policy `user_id = auth.uid()` que
le planificateur poussait dans le parcours. Cette égalité a disparu — les policies
appellent `peut_lire(board_id)`, qui ne s'indexe pas. Laissés tels quels, ces index
auraient continué d'être maintenus à chaque écriture sans plus rien servir : une
régression qu'on ne découvre qu'au premier compte volumineux. Reconstruits sur ce que les
requêtes contraignent vraiment — `board_id` pour la revue et les échéances,
`completed_by` pour les statistiques.

`tasks_focus_idx` garde l'auteur, délibérément : « Aujourd'hui » est une intention
personnelle. ⚠️ Et c'est en le décidant qu'on voit le résidu : `focus_day` est une
colonne de `tasks`, donc **une seule valeur pour tout le monde**. Sur une matrice
partagée, deux personnes qui mettent la même tâche dans leur journée s'écrasent. Hors
périmètre de #53, noté ici parce que c'est ici qu'on s'en aperçoit.

### 2026-09-22 : Migration D — invitations par lien

**Statut** : Terminé

**Actions réalisées** :
- Table `board_invitations` : hachage du jeton (jamais le clair), expiration à 7 jours,
  **usage unique** (`accepted_at`).
- `creer_invitation(board, role, email)` — `security invoker`, la policy d'insertion
  vérifie déjà la propriété ; le jeton est fabriqué en base et rendu une seule fois.
- `lire_invitation(jeton)` — `security definer`, rend ce que l'écran affiche.
- `accepter_invitation(jeton)` — `security definer`, le seul endroit du schéma où
  quelqu'un s'inscrit lui-même, et il lui faut un jeton émis par le propriétaire.
- Trois policies : propriétaire seul en select / insert / delete. **Aucune `for update`** —
  personne ne peut rouvrir une invitation consommée ni repousser une expiration.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260922160000_partage_invitations.sql` (nouveau)

**Validation de bout en bout** (transaction annulée), huit assertions :

| Vérifié | Résultat |
|---|---|
| Le jeton clair n'est pas en base, le hachage y est | 0 / 1 |
| `lire_invitation` rend les données du SERVEUR | « Cuisine », demo@penduline.test, écriture |
| Jeton inventé | 0 ligne, sans message distinctif |
| Acceptation | rend le `board_id` |
| Adhésion créée avec le bon rôle | `ecriture` |
| Placement créé dans la foulée (chaînage migration B) | 1 |
| Rejeu du même jeton | « Cette invitation n'est plus valable. » |
| L'invité lit `board_invitations` | 0 ligne |

**Notes** : un seul message d'erreur pour les trois cas (inconnu / expiré / consommé).
Les distinguer ferait de la fonction un oracle permettant de tester des jetons au hasard.

Le côté base est complet : quatre migrations, la cinquième abandonnée.

### 2026-09-22 : Suite de tests RLS à deux comptes

**Statut** : Terminé

**Actions réalisées** :
- `packages/shared/src/partage.live.test.ts` — **26 tests**, tous verts, sur le harnais
  déjà posé par `realtime.live.test.ts` (opt-in `PENDULINE_LIVE`, deux comptes du seed).
- Six blocs : sans partage / en lecture / en écriture / les trois RPC / invitations /
  la fin d'un partage.
- `realtime.live.test.ts` aligné sur `author_id` (3 occurrences).

**Fichiers modifiés** :
- `packages/shared/src/partage.live.test.ts` (nouveau)
- `packages/shared/src/realtime.live.test.ts`
- `apps/supabase/migrations/20260922130000_partage_appartenance.sql` (correctif, ci-dessous)

**⚠️ Le test a trouvé un vrai bug, et pas un petit.**

`insert into boards … returning id` échouait par `new row violates row-level security
policy`. L'insertion seule passait : c'est le **RETURNING** qui soumet la ligne à la
policy de LECTURE. Or celle-ci était écrite `peut_lire(id)`, et `peut_lire` commence par
relire `boards` à la recherche de cette même ligne — que l'instruction est justement en
train d'insérer, et qu'aucune sous-requête de cette instruction ne peut voir.

**Une policy `select` qui doit relire sa propre table ne peut jamais passer sur un
`insert … returning`.** Hypothèse d'abord posée sur le `stable` de la fonction, puis
réfutée en la passant `volatile` : même échec. Ce n'est pas une affaire d'instantané.

Correctif : `est_membre(uuid)` est extraite de `peut_lire`, et la policy de lecture de
`boards` s'écrit `user_id = auth.uid() or est_membre(id)` — le cas du propriétaire est
tranché **sur la ligne elle-même**, sans aucune lecture. Accessoirement c'est aussi le cas
le plus fréquent, et il ne coûte plus un appel de fonction. La migration A a été corrigée
à la source plutôt que rattrapée par une migration de plus : elle n'a jamais tourné
ailleurs que sur cette base locale.

**Deux autres enseignements du run :**

- Le refus d'un **transfert** de tâche vers une matrice non partagée **lève**, là où les
  autres refus se contentent de ne toucher aucune ligne. La différence dit lequel des deux
  prédicats a tranché : `using` filtre en silence, `with check` refuse bruyamment. C'est
  donc bien la ligne d'ARRIVÉE qui est rejetée — la garantie la plus forte des deux, et
  l'assertion a été corrigée dans ce sens.
- Le nettoyage écrit **après** une assertion ne s'exécute jamais si elle échoue : le
  premier passage a laissé deux matrices en base. Les créations jetables sont désormais
  enregistrées à la création et détruites dans l'`afterAll`.

**Portes de qualité** : 385 tests verts (239 shared + 105 mcp + 41 web), 31 ignorés (les
deux suites live, opt-in).

### 2026-09-22 : Temps réel conforme à l'accès, types, et les trois clients

**Statut** : Terminé (actions 7 et 10, plus toute la plomberie de l'action 8)

**Le renommage a fait exactement ce qu'on attendait de lui : 94 erreurs de typage.**
Chacune est un site dont le sens avait changé. Aucun n'a été trouvé « à la relecture ».

**Actions réalisées** :

*Types partagés* — `Board` perd `universe_id`/`position` ; `BoardRange` (la matrice
assemblée, avec son rangement et le rôle) devient le type que **tous les écrans**
manipulent ; `BoardMember`, `BoardPlacement`, `Invitation`, `InvitationLue`, `Membre`,
`BoardRole` ; `Task.author_id` + `completed_by` ; `Attachment.author_id` + `board_id`.

*`realtime.ts`* — filtres conformes à l'accès, **découpés en tranches de 100**,
`setPlacements` dans le sink, `rechargerDesLAbonnement`, `memeJeu`,
`fusionnerPlacement`/`retirerPlacement` (clé composée, pas d'`id`). L'avertissement de
tête est mis à jour, pas supprimé : il reste vrai, il a changé de levier.
**+8 tests unitaires** (plafond, jeu vide, insensibilité à l'ordre, placements).

*Web* — store : `placements` et `members` en état, `matrices` assemblé en `useMemo`,
`moveBoard` écrit sur le placement, `deleteUniverse` renumérote des placements,
`addBoard` laisse le trigger poser le rangement ; **six méthodes de partage**
(`membres`, `invitations`, `inviter`, `annulerInvitation`, `changerRole`, `retirer`).

*Extension* — mêmes colonnes, même filtre, `setPlacements` dans son sink (une matrice
révoquée doit disparaître du panneau aussi), et **format d'instantané v2 → v3** : un
cache v2 peint tel quel donnerait un panneau vide, puisque sans placement rien ne
s'affiche. Le fichier documentait déjà cette obligation ; elle s'applique ici.

*MCP* — `listBoards` joint les placements, `createBoard` laisse le trigger faire et ne
fait que **ranger** si un univers est demandé.

**Migration supplémentaire : `20260922170000_partage_membres.sql`.** Le plan n'avait pas
vu que tout ce que le partage doit afficher est fait de NOMS — « alice@exemple.fr —
écriture », « coché par Bob » — et que ces adresses vivent dans `auth.users`, fermé à
l'application. D'où `membres_matrice(board)`, `security definer` mais bornée par
`peut_lire` : sans accès à la matrice, elle ne rend rien. Une table `profiles` aurait
dupliqué la donnée, demandé un trigger de synchronisation et posé la question des comptes
antérieurs — beaucoup de machinerie pour ce qu'on a déjà.

**⚠️ Deux tests ont dû changer d'affirmation, et c'est le bon sens de la correction :**

- `tools.test.ts` affirmait que la matrice créée porte `universe_id` et `position`. Elle
  ne les porte plus — c'est le sujet. Le test affirme désormais leur ABSENCE, et qu'un
  univers demandé s'écrit sur le placement. Il a fallu pour cela apprendre **un** trigger
  à la doublure de base (`boards` → `board_placements`) : sans lui `createBoard` n'était
  pas testable du tout, puisqu'il relit le placement dans la foulée.
- `realtime.live.test.ts` prenait « la première matrice venue » du seed. Depuis que
  `partage.live.test.ts` existe, les deux suites tournent **en parallèle** contre la même
  base, et l'autre crée puis détruit des matrices : la première venue disparaissait au
  milieu d'un test. Symptôme : une non-délivrance parfaitement logique, dans le fichier
  dont tout l'objet est de distinguer le silence légitime du silence fautif. Il crée
  désormais sa propre matrice.

**Portes de qualité** : `typecheck` propre, **397 tests** (250 shared + 106 mcp + 41 web),
`build` vert, et les **31 tests live** passent, deux fois de suite, sans résidu en base.

### 2026-09-22 : L'interface

**Statut** : Terminé (actions 8 et 9)

**Fichiers créés** :
- `apps/web/src/lib/partage.ts` — lecture PURE de l'URL (`readInvitation`), fabrication du
  lien, et les trois appels RPC. Même patron que `lib/mcp.ts` : deux fonctionnalités qui
  entrent par l'URL doivent entrer de la même façon.
- `apps/web/src/screens/Invitation.tsx` — sur `AuthorizeScreen` de bout en bout.
- `apps/web/src/components/ShareModal.tsx` — sur `ConnectedApps`.
- `apps/web/src/data/useMembres.ts` — ne charge **rien** sur une matrice personnelle.

**Fichiers modifiés** : `App.tsx`, `Home.tsx`, `Matrix.tsx`, `BoardMenu.tsx`, `TaskCard.tsx`,
`OriginBadge.tsx`, `store.ts`, `styles.css`.

**Les trois points remontés par la revue UX, tous tenus** :

- **Lecture seule** : le champ d'ajout et la case à cocher sont désactivés **en portant
  leur motif** (`lectureSeule?: string | null`, exactement la forme de `CardFocus.refusal`
  — une chaîne, pas un booléen). Le champ reste VISIBLE : le retirer laisserait croire que
  la matrice n'a pas d'ajout, alors qu'elle en a un, pour d'autres.
- **Révocation pendant la consultation** : `AppRoot` retombait déjà sur l'accueil quand la
  vue pointait dans le vide, mais **en silence** — ce qui convenait tant que le seul cas
  était « je l'ai supprimée moi-même ailleurs ». Le hook `useMatriceDisparue` nomme
  désormais la matrice (nom tenu dans une ref : à l'instant de la disparition elle n'est
  déjà plus dans `store.boards`), pose un toast et **annonce**.
- **`aria-live`** : création de lien, copie, changement de rôle, retrait d'accès,
  disparition d'une matrice. Un changement poussé par le temps réel est par construction
  un changement que personne n'a déclenché — sans annonce, il n'existe pas.

**Deux entrées de menu mutuellement exclusives**, pas une entrée grisée : « Partager… /
Renommer / Supprimer » chez le propriétaire, « Quitter le partage » chez l'invité. Un
invité n'a pas à découvrir qu'il n'est pas propriétaire en cliquant sur un bouton mort.

**`SharedBadge`** est le jumeau d'`OriginBadge`, à la ligne près : il porte son texte
(la couleur seule n'informe pas un daltonien) et ne s'affiche pas dans le cas ordinaire.

**Le point de rupture nommé par le plan est refermé** : `SignIn` reçoit `invitation` et
passe `emailRedirectTo: window.location.href` — l'URL qui porte le jeton. Sans ça, la
confirmation d'adresse ramenait l'invité sur un accueil vide, sans aucun moyen de savoir
qu'il lui manquait un clic.

**Portes de qualité** : `typecheck` propre, **397 tests**, `build` vert, **31 tests live**.

### 2026-09-22 : Validation à deux comptes dans un vrai navigateur

**Statut** : Terminé

Deux contextes de navigateur isolés, deux comptes réels, sur le Supabase local.
Aucune erreur ni avertissement en console sur l'une ou l'autre page.

| Vérifié | Résultat |
|---|---|
| L'accueil charge avec le nouveau schéma (rangement issu des placements) | univers et ordre intacts |
| « Partager… » dans le menu `⋯` | présent, après le rangement |
| La modale liste le propriétaire avec son adresse | `membres_matrice` OK de bout en bout |
| Création d'un lien | jeton clair affiché **une fois**, expiration à J+7, entrée « en attente » |
| Le lien ouvert **déconnecté** | « Une matrice vous attend… » sur l'écran de connexion |
| L'écran d'acceptation | nom, inviteur et rôle **rendus par le serveur** |
| Après « Rejoindre » | l'accueil de l'invité ne montre QUE la matrice partagée, pastille « lecture » |
| Lecture seule | chaque champ d'ajout porte « Vous avez accès en lecture », cases désactivées |
| Attribution | « par demo@penduline.test » sur chaque carte |
| **Temps réel entre comptes** | une tâche insérée côté propriétaire apparaît chez l'invité **sans rechargement** |
| **Révocation pendant la consultation** | retour à l'accueil + toast « L'accès à « Cuisine » vous a été retiré. » |

**⚠️ Une lacune trouvée par cette validation, et corrigée.**

Un changement de rôle ne se propageait pas : `board_members` n'était publiée nulle part,
et les adhésions n'étaient chargées qu'une fois. Un invité promu en écriture continuait
donc de lire « Vous avez accès en lecture » sur des champs désactivés, alors que la base
acceptait ses écritures.

C'est le défaut que tout le reste du ticket s'attache à éviter, **retourné** : un refus
motivé mais FAUX est pire qu'un refus muet — il explique avec assurance quelque chose qui
n'est plus vrai. Aucun test ne pouvait l'attraper : la RLS est correcte, les tests live
passent, et seule une mise en situation le montre.

Correctif — `20260922180000_partage_roles_temps_reel.sql` : `board_members` publiée,
`replica identity full`, filtre `user_id=eq.<moi>`. Ce filtre est **plus étroit que la
policy**, délibérément : la policy laisse voir ses co-membres (« coché par Bob » en a
besoin), mais personne n'a à être réveillé parce que le rôle d'un TIERS a changé.
`fusionnerMembre`/`retirerMembre` + 3 tests unitaires.

Revérifié dans le navigateur : la pastille passe de « lecture » à « partagée » en direct,
les cases redeviennent « Terminer » et les champs d'ajout s'activent, sans rechargement.

**Portes de qualité finales** : `typecheck` **0 erreur** · **400 tests** (253 shared +
106 mcp + 41 web) · `build` vert (web + extension) · **31 tests live** · base rendue à son
état de seed (4 matrices, 10 tâches, 0 adhésion).