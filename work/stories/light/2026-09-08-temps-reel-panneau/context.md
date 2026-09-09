---
slug: "temps-reel-panneau"
title: "Temps réel du panneau, et délivrance scopée à l'accès"
issues: [117]
created: 2026-09-08
---

# Contexte

## Description fonctionnelle

Le panneau d'extension reste ouvert pendant des heures depuis son passage en
panneau latéral, mais il ne voit rien de ce qui se passe ailleurs. Une tâche
cochée dans l'application web, une capture faite par le menu contextuel, une
modification depuis un autre appareil : le panneau continue d'afficher son état
d'avant. La 1.5.0 a posé un rattrapage — relecture au changement de vue et au
retour de visibilité — qui ne se déclenche qu'au moment où l'on regarde. Cette
story donne au panneau le canal temps réel que le web possède déjà : ce qui change
arrive sans qu'on ait à toucher au panneau.

Le second volet de la story n'a **aucun effet observable aujourd'hui**, et il faut
le dire tel quel. Le serveur ne pousse aujourd'hui les changements qu'au
propriétaire de la matrice, parce que le client demande explicitement ses propres
lignes. On retire cette demande pour laisser le serveur seul juge de qui a le droit
de recevoir quoi. Comme il n'existe encore ni partage ni notion d'invité, le
résultat est strictement identique à celui d'aujourd'hui : un compte seul reçoit
exactement les mêmes événements, ni plus ni moins. Le bénéfice est différé — il se
matérialisera avec le partage de matrice (#53), qui trouvera un client déjà correct
au lieu d'avoir à le reprendre. Pour cette story, le seul critère est la
non-régression.

Ce qui change pour l'utilisateur : le panneau se met à jour de lui-même sur les
tâches, les matrices et les univers, pendant qu'il est ouvert. Ce qui ne change
pas : l'apparence du panneau, ses gestes, ses vues ; la première peinture, qui
continue de venir du dernier état connu sans écran de chargement ; le comportement
de l'application web, qui synchronise déjà et doit continuer exactement comme
avant. Le panneau ne gagne pas les pièces jointes ni la corbeille, qu'il ne porte
pas, et n'affiche pas les tâches archivées ou cochées qu'il exclut déjà — le temps
réel ne doit pas les réintroduire. Les rattrapages existants restent en place comme
filet quand la connexion temps réel n'est pas établie.

Hors périmètre : le partage de matrice et les droits d'accès associés, l'édition à
plusieurs sur une même tâche, et toute notification vers un utilisateur autre que
le propriétaire — il n'y en a pas encore.

Critères d'acceptation, en gestes observables :

- Panneau ouvert sur une matrice, cocher une tâche depuis l'application web : la
  tâche disparaît du panneau sans y toucher.
- Panneau ouvert, capturer une page par le menu contextuel : la tâche apparaît dans
  le panneau, sans changement de vue ni rechargement.
- Panneau ouvert, renommer une matrice ou un univers depuis le web : le nouveau nom
  s'affiche dans le panneau.
- Deux onglets web du même compte : créer, cocher, renommer, déplacer une tâche,
  ajouter un lien, créer ou supprimer une matrice, renommer un univers — chaque
  geste apparaît dans l'autre onglet, comme avant cette story.
- Deux comptes différents dans deux navigateurs : écrire dans l'un ne fait rien
  bouger dans l'autre.
- Panneau ouvert, couper le réseau, modifier une tâche depuis un autre appareil,
  rétablir le réseau : le panneau affiche la modification manquée.
- Réseau coupé, changer de vue dans le panneau : les données restent affichées et le
  panneau tente de les relire.
- Cocher une tâche dans le panneau au moment où la même tâche change ailleurs : la
  case ne revient pas en arrière sous les doigts.

## Vue architecturale

Le système compte trois étages, et cette story n'en ajoute aucun : elle redessine
une frontière **à l'intérieur** de ce qui existe. En haut, Postgres et le service
Realtime, inchangés — aucune migration. Au milieu, `@penduline/shared`, qui gagne
un module de temps réel. En bas, deux hôtes React : l'app web et le panneau
d'extension. La ligne de coupe passe entre ce qui est *invariable* et ce qui est
*propre à l'hôte*. Est invariable la façon de fusionner une ligne reçue, de
neutraliser l'écho de ses propres écritures par comparaison, et de recharger à la
reconnexion : cela ne dépend ni de React ni de l'application. Est propre à l'hôte
ce que l'hôte *sait absorber*.

```
   @penduline/shared/realtime          ← zéro import React, zéro singleton
   ├── fusionner / retirer / identiques    (pur → enfin testable)
   └── câblage du canal                     (reçoit un client, rend un désabonnement)
              ▲                                    ▲
              │  contrat « sink » (inversion de contrôle)
              │  · collections d'écriture d'état
              │  · `admits` : ce qui a sa place en mémoire
              │  · `reload` : par où repartir de la vérité
       ┌──────┴───────┐                    ┌────────┴────────┐
       │  app web     │                    │  panneau ext.   │
       │  useEffect   │                    │  useEffect      │
       │  admits =    │                    │  admits =       │
       │  ensemble de │                    │  règle du       │
       │  travail #40 │                    │  panneau        │
       │  (garde les  │                    │  (done=false,   │
       │   étapes ✓)  │                    │   pas d'étapes) │
       └──────────────┘                    └─────────────────┘
```

Deux propriétés de ce contrat méritent d'être nommées, parce qu'elles portent la
cohérence. D'abord, le client Supabase est **injecté**, exactement comme
`createSupabase` le fait déjà : le module partagé ne connaît ni l'environnement du
web, ni l'adaptateur `chrome.storage` du panneau. Ensuite, l'**absence** d'une
collection dans le sink *est* l'instruction de configuration : pas de drapeau
`mode`, la table simplement pas abonnée. Le panneau n'a ni pièces jointes ni
corbeille ; son sink le dit en se taisant. C'est la même convention que les props
facultatives de `TaskCard`, et elle évite l'écueil classique du code partagé — un
paramètre de mode qui grossit à chaque nouvel hôte. Enfin, `admits` reste chez
l'hôte parce que les deux hôtes ne lisent pas le même ensemble : les mutualiser
ferait rentrer par le canal ce que le `select` du panneau écarte. La règle partagée
est le *mécanisme*, pas la *politique*.

Le second axe est la délivrance. Voici le chemin réel d'un changement, et pourquoi
le filtre serveur n'y a jamais été la frontière de sécurité :

```
un client écrit  (INSERT / UPDATE / DELETE)
        │
        ▼
   Postgres ──► WAL ──► la ligne voyage ENTIÈRE
                        (`replica identity full`, sur les 4 tables publiées)
                          │
                          ▼
                  service Realtime  — décode le WAL UNE fois
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼        pour CHAQUE abonné :
   abonné A          abonné B          abonné C
   RLS(jeton A)      RLS(jeton B)      RLS(jeton C)  ◄── LA frontière
      autorise          autorise          refuse
        │                 │                 │
        ▼                 ▼                 ✗ rien n'est émis
   WebSocket A       WebSocket B       (silence, aucune erreur)
```

Le filtre `user_id=eq.<moi>` s'insérait **avant** cette évaluation, comme raccourci
de réveil. Le retirer ne déplace donc rien de la sécurité ; il retire une *copie*
de la décision d'accès dans le client. Or une copie dérive, et elle dérive en
silence : sous #53 elle bloquerait un invité sans lever d'erreur, et
`tasks.user_id` change de sens (propriétaire → auteur) sans qu'aucun type ne s'en
aperçoive. Le motif « la RLS est seule juge » n'est pas inventé ici : les trois RPC
`security invoker` du dépôt n'ont déjà aucun prédicat `user_id`, et
`work/architecture.md` l'affirme comme principe. Ce que le retrait coûte est un
déplacement de complexité, honnête : on passe d'un préfiltrage bon marché à une
évaluation RLS par abonné et par événement. À l'échelle actuelle c'est négligeable,
et le levier `board_id=in.(…)` reste disponible — d'où la décision de l'écrire en
commentaire à l'endroit du choix, et non dans un ticket que personne ne relira.

Le corollaire côté extension est du même ordre : **le service worker MV3 ne
s'abonne pas**. Il n'est pas une surface, c'est un processus que le navigateur tue
en boucle ; un socket y serait rompu en permanence, et son chunk `session-bridge`
est déjà rechargé à chaque réveil. La topologie qui en découle est plus simple, pas
plus contrainte :

```
service worker (éphémère)        panneau latéral (ouvert des heures)
  capture par menu contextuel        SEUL détenteur d'un canal
        │                                        ▲
        └──► écrit en base ──► WAL ──► Realtime ──┘
             (le retour se fait par LE canal du panneau,
              pas par un pont de messages à inventer)
```

Restent les quatre mécaniques de fraîcheur, dont l'articulation est le vrai point
d'architecture : elles ne se recouvrent pas, chacune couvre un mode de défaillance
que la précédente ne peut pas *observer*.

```
ouverture ──► cache local          « pas encore de réseau »      → peint
          ──► chargement réseau    « réseau »                    → vérité
en vie    ──► canal SUBSCRIBED     « réseau + socket »           → flux
coupure   ──► rien n'arrive, et rien ne le signale
              ├─ socket revient ──► re-souscription ⇒ relecture   (comble le trou :
              │                                                   les événements
              │                                                   perdus ne se
              │                                                   rejouent pas)
              └─ socket down     ──► changement de vue ⇒ relecture de repli
                                     (hors ligne, proxy qui bloque les WebSockets)
```

L'ajustement introduit une seule dépendance nouvelle : l'**état du canal devient un
signal de premier rang** dans le store du panneau, puisque la relecture au
changement de vue s'y conditionne. C'est le seul couplage créé, et il est
délibéré — supprimer la relecture au lieu de la conditionner priverait de tout
rattrapage un panneau derrière un proxy hostile. Bon signe collatéral : le
garde-fou `gen`/`enVol` de #116, écrit pour protéger la relecture silencieuse
d'une écriture locale non acquittée, sert désormais un second appelant sans être
touché — la frontière avait été tracée au bon endroit.

Les impacts sur l'existant sont modestes mais réels. `@penduline/shared` cesse
d'être un paquet de logique pure plus une fabrique : il accueille du **câblage
d'infrastructure neutre vis-à-vis de l'hôte**, ce qui est une catégorie nouvelle
dans ce paquet et doit rester circonscrite (recevoir un client, ne jamais en
fabriquer un, ne rien savoir de React). Le web, lui, subit une extraction : c'est
là que se situe le risque de régression, avec deux pièges déjà identifiés — la ref
qui tient le sink à jour, et l'`admits` qui ne doit pas être mutualisé.

Ce que #53 hérite est plus lourd que le code livré. Il hérite d'un client **vide de
toute décision d'accès** : le périmètre de délivrance vit désormais entièrement
dans les policies, ce qui en fait le levier unique — et donc le point de
défaillance unique. Trois conséquences concrètes s'y attachent, au-delà des trois
constats déjà consignés dans le plan.

1. `replica identity full` cesse d'être une commodité pour les DELETE et devient
   une **précondition d'évaluabilité** d'une policy à jointure. Un DELETE sur
   `tasks` porte bien `board_id`, donc une policy « membre de la matrice » pourra
   trancher ; sur `task_attachments`, qui n'atteint sa matrice que par
   `task_id → tasks.board_id`, la même policy imposera une sous-requête évaluée par
   abonné et par événement — exactement le coût que le retrait du filtre a rendu
   visible.
2. Le socket porte le jeton avec lequel il a été ouvert, donc `jwt_expiry = 3600`
   sans rotation fixe la latence de révocation d'un partage **aussi pour le temps
   réel**, pas seulement pour les requêtes.
3. Le point de bascule du produit se déplace du client vers la base, ce qui est le
   but — mais impose que la vérification de #53 se fasse à **deux comptes réels**,
   la non-délivrance croisée étant désormais la seule preuve qu'il y ait un
   cloisonnement.

## Impacts UX

**Aucun impact UX volontaire — et c'est le critère.** Cette story ne change ni un
libellé, ni une couleur, ni un geste : elle fait arriver plus tôt des données qui
arrivaient déjà. Le seul effet perceptible est que le contenu du panneau peut
maintenant bouger **sans action de l'utilisateur**.

Deux conséquences à surveiller à la vérification, parce qu'un contenu qui bouge
tout seul se lit comme un bug s'il bouge mal :

- **Ne rien voler pendant une saisie.** #39 a déjà validé ce cas côté web (« une
  saisie garde texte **et** focus pendant une écriture distante ») ; le panneau
  porte les mêmes saisies en place — renommage et éditeur d'échéance. La mécanique
  de fusion par comparaison de références y répond : une ligne inchangée ne
  provoque aucun re-rendu, donc aucun champ ne se réinitialise.
- **Ne pas faire reculer un geste en cours.** Cocher une tâche pendant qu'un
  événement distant arrive sur cette même tâche ne doit pas rendre la carte à son
  état d'avant. Le garde-fou `gen`/`enVol` de #116 couvre la relecture ; le canal
  passe par la comparaison de lignes.

Rien à dessiner, aucune icône, aucun indicateur de connexion : un témoin
« connecté / déconnecté » a été écarté sans être proposé — il attirerait l'œil sur
une plomberie qui doit rester invisible, et le rattrapage de repli rend son absence
sans conséquence.
