---
story: "Partager une matrice avec quelqu'un"
story_code: "partage-matrice"
created: 2026-09-22
---

# Contexte

## Description fonctionnelle

Aujourd'hui, une matrice appartient à une personne et n'est visible que d'elle. Or une
matrice « Maison » se tient à deux, et une matrice projet se tient avec un collègue :
sans partage, chacun garde sa copie, et la seule synchronisation possible est de se le
dire de vive voix. Le besoin adressé est celui d'une liste que plusieurs personnes
tiennent réellement ensemble — chacune voit l'état à jour, sait qui a ajouté quoi, et
coche sans avoir à prévenir.

Le propriétaire d'une matrice ouvre un partage et génère un **lien d'invitation** portant
un rôle — lecture ou écriture. Il transmet ce lien lui-même, par le canal qu'il veut :
rien n'est envoyé automatiquement par e-mail. L'adresse éventuellement saisie n'est qu'un
libellé ; c'est le lien qui fait foi. Le même chemin vaut donc pour quelqu'un qui a déjà
un compte et pour une adresse inconnue : dans ce second cas, le lien mène à l'inscription
puis directement à l'adhésion, sans détour par un accueil vide.

Une fois l'invitation acceptée, la matrice apparaît chez l'invité **sans rechargement**,
et il la range dans **ses** univers, à la position qu'il choisit. Ce rangement lui est
propre : il ne déplace rien chez le propriétaire ni chez les autres invités, et les
univers restent privés à chacun. Le rôle lecture donne la vue complète sans aucune
modification possible ; le rôle écriture permet d'ajouter, cocher, déplacer des tâches,
mais pas de renommer ni de supprimer la matrice — cela reste au propriétaire. Un invité
peut quitter un partage de lui-même, et le propriétaire peut retirer un accès : dans les
deux cas la matrice disparaît de l'écran de l'intéressé en quelques secondes, sans
rechargement, et reste intacte pour tous les autres.

Sur une matrice partagée, chaque tâche indique **qui l'a créée et qui l'a cochée** ; sur
une matrice personnelle, cette information reste masquée, puisqu'elle est toujours la
même. Les statistiques personnelles ne comptent que ce que l'on a coché soi-même, pas les
complétions des autres. En cas d'édition simultanée, la règle est le **dernier écrit
gagne** : la valeur la plus récente s'impose, mais le temps réel la rend immédiatement
visible chez l'autre — c'est l'écrasement *silencieux*, et non la concurrence, que le
partage supprime. Deux saisies en cours dans deux champs d'ajout ne se vident jamais
l'une l'autre.

Restent hors périmètre : le partage d'un **univers entier** (on partage une matrice à la
fois), l'envoi automatique d'un e-mail d'invitation (le lien se transmet à la main, par
décision), et toute ouverture des univers, qui demeurent strictement personnels. Enfin,
le cloisonnement est une exigence, pas un effet de bord : aucun compte ne doit voir — ni
à l'écran, ni dans le flux temps réel — quoi que ce soit d'une matrice qui ne lui a pas
été ouverte.

### Critères d'acceptation

- Inviter par lien, accepter, et révoquer un accès.
- Rôles **lecture** et **écriture** respectés : un lecteur ne peut ni ajouter, ni cocher,
  ni déplacer ; un rédacteur ne peut ni renommer ni supprimer la matrice.
- **Aucun accès à une matrice non partagée**, vérifié par des tests dédiés — y compris
  pour les suppressions diffusées en temps réel.
- Attribution visible des créations et des complétions sur une matrice partagée ;
  statistiques limitées à ses propres complétions.
- Édition simultanée sans perte : aucune saisie en cours n'est vidée, et tout changement
  est visible chez l'autre sans rechargement.
- Quitter un partage, ou en être retiré, laisse la matrice intacte pour les autres ;
  l'accès disparaît chez l'intéressé en quelques secondes, sans rechargement.
- Invitation d'une adresse sans compte : le lien mène à l'inscription puis à l'adhésion,
  sans repasser par l'accueil.
- Chaque invité range la matrice partagée dans ses propres univers, sans effet sur le
  rangement des autres.

## Vue architecturale

Le partage ne déplace pas le modèle de données, il déplace la **frontière de sécurité**.
Aujourd'hui, quatre tables portent chacune une policy `for all (user_id = auth.uid())`,
et cette même égalité est réécrite à quatre autres endroits : le filtre serveur du temps
réel, les insertions du store web, celles du panneau d'extension, celles des outils MCP.
Une seule hypothèse — *une ligne appartient à une personne* — recopiée huit fois. Le
ticket en invalide l'original et oblige à reprendre toutes les copies, en fonction d'une
notion qui n'existe pas encore dans le schéma : l'**accès**.

```
                       ┌─────────────────────────────────────┐
   Postgres            │  peut_lire(board) / peut_ecrire()   │ ← security definer
                       └─────────────────────────────────────┘
                           ▲                        ▲
            policies RLS ──┘                        └── fonctions RPC
   boards · tasks · task_attachments        search_tasks · review_boards
   board_members · board_placements         completion_stats · accepter_invitation
                       │
                       │  WAL → publication supabase_realtime
                       ▼
              ┌──────────────────────────────┐      diffusion
              │ Realtime — filtre serveur,   │   penduline:user:<id>
              │ PAS la RLS pour les DELETE   │            │
              └──────────────────────────────┘            │
                       │                                  │
  packages/shared ── subscribeRealtime(client, userId, <jeu accessible>) ◄┘
                       │
        ┌──────────────┼──────────────────┐
     apps/web      apps/extension      apps/mcp
   store, écrans   panneau, background   outils
```

Toute la décision d'accès tient dans deux fonctions, `peut_lire(board)` et
`peut_ecrire(board)`, et c'est délibéré : les policies des tables *et* les fonctions RPC
les appellent, si bien qu'élargir la lecture aux matrices partagées ne se fait qu'à un
endroit. Ces fonctions doivent être `security definer`, et pas par confort — par
nécessité mécanique. Une policy sur `boards` qui interrogerait `board_members`, dont la
policy interroge `boards`, se mord la queue :

```
  boards.select  ⟵ peut_lire(id) = boards.user_id = moi  OU  ∃ board_members(id, moi)
        ▲                                                         │
        └───────────── policy de board_members ───────────────────┘   boucle
```

Postgres ne devine pas la sortie : il détecte la récursion et fait échouer la requête.
`definer` casse la boucle en lisant l'appartenance **hors RLS**, une seule fois, pour
rendre un booléen. L'escalade habituelle des `definer` n'a pas prise ici : la fonction ne
rend aucune ligne, seulement un oui/non à propos de `auth.uid()`, et elle est `stable`
avec un `search_path` figé.

Le temps réel, lui, ne peut pas se contenter de suivre la RLS, parce que la RLS ne le
couvre pas entièrement. La mesure du 2026-09-08 (`packages/shared/src/realtime.ts`) est
sans ambiguïté : sur un INSERT ou un UPDATE la policy tranche et le filtre serveur est
redondant ; sur un **DELETE, le filtre est la seule barrière**. Retirer le filtre pour
qu'un invité reçoive les événements de la matrice partagée donnerait donc à tout compte
authentifié l'identifiant de chaque suppression de la base. Le filtre doit **devenir
conforme à l'accès**, pas disparaître : `board_id=in.(<matrices accessibles>)` pour
`tasks` et `task_attachments`, `id=in.(…)` pour `boards`, `user_id=eq.<moi>` là où la
table reste mono-utilisateur. Cela marche parce que Realtime évalue le filtre sur la
ligne entière avant de caviarder la charge utile. Le prix est que ce filtre est un
**instantané client d'une vérité serveur** : il périme dès qu'une adhésion bouge. D'où le
canal de diffusion `penduline:user:<id>`, qui n'est pas une frontière de sécurité mais un
signal — il déclenche recalcul du jeu, réabonnement, puis rechargement complet, parce que
Realtime ne rejoue rien et que tout réabonnement ouvre une fenêtre d'événements perdus
(le mécanisme de reconnexion existant est réemployé, pas doublé).

Deux déplacements de colonnes découlent directement de ces deux contraintes, et pas d'un
goût de normalisation. `universe_id` et `position` quittent `boards` parce que `boards`
devient une ligne partagée alors que les univers restent privés : laisser le rangement
sur la ligne partagée reviendrait à faire écrire l'invité dans une ligne dont il n'est
pas propriétaire, et à rendre son classement visible de tous — un cloisonnement par
colonne que la RLS ne sait pas exprimer proprement. `board_placements`, mono-utilisateur
par construction, garde une policy triviale et un filtre temps réel trivial : la scission
**contient** la complexité au lieu de la diffuser. Symétriquement,
`task_attachments.board_id` est dénormalisé parce que la policy comme le filtre ont
besoin de la matrice **sans jointure** : un filtre Realtime est une chaîne transmise sur
le fil, il ne sait pas joindre, et sans cette colonne la policy exécuterait une
sous-requête par abonné et par événement.

L'impact sur l'existant est une **substitution**, pas un ajout : les policies `for all`
doivent être remplacées, car une `for select` additive serait bien OR'ée en lecture mais
laisserait la `for all` gouverner UPDATE et DELETE — un invité en lecture pourrait
supprimer. C'est là qu'est le risque central : depuis #117 il n'y a plus de filtre client
pour masquer une policy trop large, donc **une erreur de policy expose un compte à un
autre, en silence**. Trois garde-fous le compensent, et ils sont architecturaux plutôt
que procéduraux : la suite de tests à deux comptes écrite **avant** le client (la
non-délivrance croisée est la seule preuve de cloisonnement qui reste) ; le renommage
`user_id → author_id` sur `tasks` et `task_attachments`, qui fait échouer à la
compilation les sites d'écriture dont le sens a changé au lieu de compter sur une
relecture ; et `completed_by`, sans lequel l'élargissement de la policy `tasks` ferait
compter à chacun les complétions des autres dans `completion_stats` — la dérive
silencieuse typique d'un élargissement de lecture. Restent des risques mesurables, à
lever au spike : la longueur d'URL d'un `in.(…)` pour un compte à deux cents matrices, la
disponibilité de `realtime.send()` depuis un trigger (repli documenté côté client), et la
fenêtre d'événements perdus à chaque réabonnement — assumée, puisqu'un rechargement
complet la referme.

## Impacts UX

Le partage n'ajoute pas un écran : il ajoute une **seconde personne** dans une interface
qui n'en supposait qu'une, et c'est ce que les changements doivent rendre lisible. Le
menu `⋯` d'une matrice gagne une entrée et une seule selon le rôle — « Partager… » chez
le propriétaire, « Quitter le partage » chez l'invité — placée après le séparateur, dans
la zone des gestes rares, à côté de « Renommer » et « Supprimer ». Deux entrées
mutuellement exclusives plutôt qu'une entrée grisée : un invité n'a pas à découvrir qu'il
n'est pas propriétaire par un bouton mort. « Partager… » ouvre `ShareModal`, qui reprend
le gabarit de `ConnectedApps` sans inventer de vocabulaire : une liste de personnes, une
ligne par personne avec son rôle et un bouton « Révoquer », une `Confirm` qui dit ce que
la révocation emporte et ce qu'elle laisse en place. C'est le même geste que révoquer une
application connectée, il doit se présenter de la même façon. La seule pièce neuve est la
création du lien : un bouton, un champ en lecture seule, « Copier » — le lien se partage
à la main, par décision, donc l'écran doit assumer cette étape au lieu de la déguiser en
envoi d'e-mail.

```
┌ Partager « Maison » ───────────────────────── ✕ ┐
│                                                 │
│  alice@exemple.fr    écriture ▾      Révoquer   │
│  bob@exemple.fr      lecture  ▾      Révoquer   │
│                                                 │
│  ── Inviter ─────────────────────────────────── │
│  [ adresse (facultatif) ]  [ lecture ▾ ]        │
│                               [ Créer un lien ] │
│  https://…/invitation?t=…            [ Copier ] │
│  Ce lien donne l'accès à qui l'ouvre. Il expire │
│  dans 7 jours.                                  │
└─────────────────────────────────────────────────┘
```

Sur l'accueil, une matrice partagée porte une pastille « partagée » à côté de la pastille
« agent », sur le patron d'`OriginBadge` : gabarit de `.due`, et le badge **porte son
texte** — la couleur seule n'informe pas un daltonien, et c'est la règle déjà posée dans
`styles.css`. Comme pour `origin`, rien ne s'affiche sur une matrice personnelle :
décorer 99 % des lignes pour signaler le 1 % restant est exactement l'erreur qu'on a déjà
refusée une fois. Même logique pour l'attribution sur `TaskCard` : « par Alice »,
« coché par Bob » n'apparaissent que si la matrice est partagée, parce que sur une
matrice personnelle c'est toujours soi, donc du bruit. L'écran d'invitation suit
`Authorize` de bout en bout : même `.auth-card`, même structure — qui invite, à quoi,
avec quels droits, puis « Rejoindre » / « Refuser » — et la même règle de fond, **ce qui
s'affiche est ce que le serveur rend, jamais ce que l'URL porte**. Un lien forgé
afficherait sinon un nom de matrice rassurant au-dessus du partage de quelqu'un d'autre.
Le parcours sans compte tombe alors de lui-même, à condition que le motif de
`readAuthorizeRequest` soit tenu jusqu'au bout : lien → pas de session → inscription →
**retour sur l'invitation**, pas sur un accueil vide. Le point de rupture est connu et
nommé dans le plan (`SignIn` passe `redirectTo: window.location.origin`) ; s'il n'est pas
corrigé, l'invité confirme son adresse et atterrit devant une application vide sans
savoir qu'il lui manque un clic — l'échec le plus coûteux du parcours, parce qu'il est
silencieux.

```
  lien reçu ──▶ /invitation?t=…
                     │
          session ? ─┴─ non ─▶ inscription ──▶ (retour au lien) ─┐
                     │                                           │
                    oui ──────────────────────────────────────▶ « Rejoindre »
                                                                 │
                                                        la matrice apparaît
```

Restent les deux moments où l'interface doit parler au lieu de se taire. **Un invité en
lecture qui tente d'écrire** ne doit pas trouver des contrôles absents : la matrice
s'affiche entière, et les gestes d'écriture sont désactivés *en portant leur motif*, sur
le modèle déjà établi par `CardFocus.refusal` — « un blocage muet se lit comme un bug, un
blocage expliqué se lit comme une intention ». En pratique : champ d'ajout désactivé avec
« Vous avez accès en lecture », cases à cocher et glisser-déposer inertes, menus de tâche
réduits aux entrées sans effet de bord. La RLS refusera de toute façon ; l'interface doit
rendre ce refus prévisible *avant* le geste, pas après. **La révocation** est le cas le
plus brutal, parce qu'elle arrive pendant que l'invité regarde l'écran : la matrice
disparaît de l'accueil, ou, si elle est ouverte, l'écran doit retomber sur l'accueil avec
un message explicite (« L'accès à « Maison » vous a été retiré ») plutôt que de se vider
ou de tomber en erreur de chargement. Un retrait non expliqué se lit comme une perte de
données. Côté accessibilité, tout cela passe par les briques existantes et rien d'autre :
`useDialog` donne à `ShareModal` le contrat clavier complet — focus pris, `Échap`, `Tab`
confiné, focus rendu — sans y penser ; et la région `aria-live` d'`announce.tsx` est le
seul endroit où l'apparition d'une matrice partagée, sa disparition sur révocation et le
refus d'une action en lecture seule deviennent perceptibles pour qui ne voit pas la
liste. Un changement poussé par le temps réel est, par construction, un changement que
personne n'a déclenché : sans annonce, il n'existe pas. Le rôle dans `ShareModal` doit
être un `select` étiqueté et non une pastille cliquable, et la pastille « partagée »
comme l'attribution de `TaskCard` restent du texte, jamais une icône seule.
