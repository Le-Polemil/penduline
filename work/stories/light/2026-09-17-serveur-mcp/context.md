---
story: "Serveur MCP Penduline"
story_code: "serveur-mcp"
created: 2026-09-17
---

# Contexte

## Description fonctionnelle

Un assistant qui discute d'une organisation avec son utilisateur sait déjà, à la fin de la
conversation, ce qu'il faudrait poser dans une matrice ; il n'a aucun moyen de le faire.
Tout repasse par une ressaisie à la main, et c'est précisément là que le découpage
péniblement obtenu se perd. Le serveur MCP ouvre le Penduline de son propriétaire à un
client compatible : créer un univers, y poser des matrices et des tâches, reclasser,
cocher. Le bénéfice se mesure à ce qui disparaît — l'aller-retour entre la conversation et
l'application.

L'authentification s'écarte de l'issue et c'est tranché : OAuth 2.1 remplace le jeton
d'accès personnel. L'utilisateur ne génère ni ne colle rien ; le client découvre seul qu'il
lui faut un jeton, ouvre un navigateur, et l'utilisateur approuve une demande nommée. C'est
ce que la spécification MCP attend d'un serveur distant, et la note reste contenue parce
que la connexion est déléguée à l'application web, qui sait déjà connecter quelqu'un — le
serveur d'autorisation n'écrit aucun formulaire de login. Corollaire visible côté produit :
plus de table de jetons personnels, mais des applications connectées, listées et
révocables depuis l'application, la révocation prenant effet au prochain appel et non à
l'expiration du jeton.

Second écart assumé : la traçabilité s'écrit `origin` sur les trois niveaux — univers,
matrices, tâches — là où l'issue mélangeait `origin` et `created_by`. Une seule notion
mérite un seul nom, et la marque n'aurait aucun sens si elle s'arrêtait aux tâches : un
univers entier peut naître d'un agent. Ce qu'une IA a écrit doit se voir sans effort dans
l'application web comme dans l'extension, par une pastille portant son propre texte et pas
seulement une couleur, faute de quoi on perd la main sur sa propre matrice.

Le périmètre couvre neuf outils — trois lectures, deux créations de structure, création,
modification, déplacement et complétion de tâche — plus l'écran de consentement, la gestion
des applications connectées, le marquage d'origine et une limitation de débit par
autorisation. Ce qui ne change pas compte autant : les règles de placement restent celles
du code partagé, aucune logique de positionnement ou d'appairage n'est réécrite côté
serveur, l'isolation continue de reposer sur les policies existantes plutôt que sur des
contrôles dupliqués, et les écrans actuels gardent leur navigation. Restent dehors
l'extension MCP Apps, les portées de jeton distinguant lecture et écriture, et un compteur
de quota partagé entre plusieurs instances.

L'acceptation tient à sept points. Un client MCP réel se connecte sans qu'aucun jeton ne
soit copié à la main, et liste les neuf outils. Une autorisation porte l'identité d'un seul
utilisateur : un second compte ne voit rien du premier. Les neuf outils opèrent depuis ce
client, en respectant les invariants du domaine — une tâche appairée déplacée entraîne sa
partenaire, une tâche appairée cochée rompt le lien des deux côtés. Le contenu créé par un
agent se distingue dans l'application et dans l'extension. Révoquer une application depuis
l'application web fait échouer l'appel d'outil suivant, immédiatement. Le dépassement du
quota rend une erreur explicite plutôt qu'un échec opaque. Enfin, les insertions faites
depuis l'application restent marquées comme humaines sans qu'aucun de ses formulaires ait à
porter la nouvelle colonne.

## Vue architecturale

Le serveur MCP est un quatrième composant déployable, à parité avec l'app web et
l'extension : un service Node autonome (`apps/mcp`) qui ne parle qu'à PostgREST, par le
même Kong que les clients existants, avec les mêmes tables et les mêmes policies. Il
n'ajoute aucun conteneur à la stack Supabase — point non négociable sur une machine de 4 Go
déjà dégraissée de sept services — et ne touche pas au chemin de l'app web en production,
qui reste un nginx servant des fichiers statiques. Le client MCP (Claude Code ou
équivalent) ne connaît que ce service ; il n'a jamais ni clé `anon`, ni JWT Supabase, ni
URL de la base.

```
   client MCP                      navigateur de l'utilisateur
       │                                      │
       │ /mcp, /token, /register              │ /autoriser?demande=…
       │ /.well-known/*                       │ (écran de consentement)
       ▼                                      ▼
┌──────────────────────────┐          ┌──────────────────────┐
│  apps/mcp                │          │  apps/web (nginx)    │
│  ┌────────────────────┐  │◀─────────│  POST /authorize/    │
│  │ serveur d'autorisa-│  │  JWT     │       decision       │
│  │ tion OAuth 2.1     │  │ Supabase │  (session déjà là)   │
│  ├────────────────────┤  │          └──────────┬───────────┘
│  │ serveur MCP        │  │                     │ PostgREST
│  │ 9 outils           │  │                     │ (RLS: oauth_grants,
│  └─────────┬──────────┘  │                     │  univers, matrices…)
└────────────┼─────────────┘                     │
             │ PostgREST, JWT signés à la volée  │
             ▼                                   ▼
        ┌───────────────────────────────────────────┐
        │  Kong → PostgREST → Postgres (RLS)        │
        │  + GoTrue (sessions de l'app web)         │
        └───────────────────────────────────────────┘
```

**Un seul service pour deux rôles.** Le serveur d'autorisation et le serveur de ressource
vivent dans le même process : une image, un domaine, un jeu de variables. La spec MCP
autorise explicitement cette colocalisation, et pour un serveur personnel la séparer
coûterait un second déploiement sans rien isoler — les deux moitiés partagent de toute
façon `MCP_TOKEN_SECRET` et la lecture de `oauth_grants`. L'alternative Edge Function est
fermée : `edge-functions` a été retiré du compose au dégraissage, et le réintroduire
rendrait ~1 Go de RAM au mauvais poste. Le prix assumé de ce choix est que les codes
d'autorisation et les demandes en attente vivent en mémoire, tout comme le quota : le
service est mono-instance par construction, et le redimensionner horizontalement demanderait
un état partagé qui n'existe pas aujourd'hui.

**Trois jetons, deux secrets — c'est là que se joue la sécurité.** Le jeton remis au client
est signé avec `MCP_TOKEN_SECRET` et porte `aud: penduline-mcp` : il n'a strictement aucune
valeur devant PostgREST, ce qui ferme la possibilité qu'un client contourne le serveur pour
taper la base directement avec son propre jeton. Les deux JWT Supabase (`authenticated`
pour les données métier, `service_role` pour les seules tables OAuth invisibles sous RLS)
sont signés avec `SUPABASE_JWT_SECRET`, fabriqués à la demande et valides 60 s. Cette durée
reprend le raisonnement déjà écrit pour `GOTRUE_JWT_EXP` : PostgREST valide un JWT hors
ligne, sans registre de révocation, donc la durée de vie d'un jeton *est* la fenêtre pendant
laquelle une révocation reste sans effet. La ramener à un appel, plus la relecture de
`oauth_grants` à chaque appel, rend la révocation immédiate au lieu d'attendre une heure. Le
déroulé d'un appel d'outil, dans l'ordre :

```
vérifier le Bearer avec MCP_TOKEN_SECRET, exiger aud = penduline-mcp
relire l'autorisation      -> JWT service_role 60 s ; revoked_at non nul => 401
appliquer le quota         -> en mémoire, par autorisation ; dépassé => 429
lire l'état nécessaire     -> JWT authenticated 60 s, sub = l'utilisateur
calculer le plan d'écriture-> packages/shared/src/layout.ts
écrire le plan             -> même JWT authenticated, RLS applique l'isolation
```

**Ce que le serveur ne réimplémente pas est aussi structurant que ce qu'il ajoute.**
L'isolation multi-compte reste entièrement dans les policies RLS, comme pour le web et
l'extension : en signant un JWT `authenticated` dont le `sub` est l'utilisateur, le serveur
se place sous les mêmes règles qu'un navigateur, sans une ligne de filtrage en TypeScript —
une isolation réécrite côté serveur serait une seconde source de vérité, silencieusement
divergente au premier oubli de `user_id`. Même logique pour l'authentification : le serveur
d'autorisation n'écrit aucun formulaire de connexion et redirige vers l'app web, qui sait
déjà connecter quelqu'un, gère la récupération de mot de passe et porte la session ; elle
renvoie la décision au serveur avec le JWT Supabase courant, vérifié par le secret partagé.
Et toute écriture passe par `packages/shared/src/layout.ts` : `endPosition`,
`planPairMove`, `planPairDetach` encodent l'appairage, les positions fractionnaires et
l'état terminal `done + archived` sur lequel les statistiques s'appuient. Rejouer ces règles
dans les outils produirait des données que l'app web sait afficher mais pas expliquer — le
seul point délicat est de ne pas appeler `planPairPatch` pour un titre, qui l'appliquerait
aux deux tâches d'une paire.

**Les impacts sur l'existant sont peu nombreux mais chacun a un effet de bord.** Un
quatrième workspace entre dans le monorepo, et c'est `apps/web/Dockerfile` qui casse le
premier si on l'oublie : il copie les manifestes un à un et `npm ci` échoue sur un workspace
déclaré sans `package.json` — le piège déjà payé pour `apps/extension`, avec la
particularité que la panne apparaît là où on ne l'attend pas. La CI publie une seconde image
GHCR, `penduline-mcp`, sans build arg puisque toute sa configuration est runtime, à la
différence du web dont les variables Vite sont inlinées au build ; `VITE_MCP_URL` s'ajoute
d'ailleurs à cette liste de build args, avec la conséquence habituelle qu'en changer impose
un rebuild du front. Côté schéma, la migration ajoute un enum `origin` et sa colonne sur les
trois niveaux (ajout avec défaut, donc sans réécriture de table, et `replica identity full`
déjà posé fait suivre le temps réel sans intervention) plus deux tables OAuth :
`oauth_clients` sur le modèle `job_runs` — RLS activée, aucune policy, aucun droit pour
`anon` ni `authenticated`, donc visible du seul `service_role` — et `oauth_grants`, qui
porte au contraire une policy propriétaire, précisément pour que l'app web liste et révoque
les applications connectées sans passer par le serveur MCP. Enfin, l'écart de rythme entre
front et extension reste valable ici : la colonne `origin` est additive, donc les deux
clients peuvent l'ignorer sans casser, mais toute évolution destructive de ces tables devra
attendre la diffusion Store comme le reste.

## Impacts UX

Trois surfaces apparaissent, et aucune ne modifie la navigation existante. L'écran de
consentement est une route à part entière, `/autoriser`, lue par une fonction pure au
premier rendu d'`App.tsx` sur le modèle déjà en place pour `recovering` (`App.tsx:60-115`) :
un drapeau évalué dans un `useState` paresseux, testé après `!session` pour qu'un visiteur
déconnecté passe par la connexion et retombe sur l'écran plutôt que de perdre sa demande. Le
placement après `!session` n'est pas un détail d'implémentation : il décide de ce que voit
quelqu'un qui arrive depuis un client tiers sur un navigateur froid, et c'est le cas
nominal. La modale « Applications connectées » s'ouvre depuis `.userbar__right`, à côté de
« Rechercher » et « Déconnexion », parce que c'est la seule barre présente sur les trois
écrans (accueil, matrice, vue globale) et que gérer ses accès est une opération de compte,
pas de contenu ; bâtie sur `useDialog` et `.bin-backdrop` comme la corbeille, elle ne touche
ni `View`, ni `readView`, ni le sessionStorage. La pastille « créé par l'agent » reprend le
patron de `.due` (`styles.css:647-669`, `TaskCard.tsx:536-543`) : une pastille inline, texte
court, fond neutre, posée sur la carte de tâche, sur la ligne de matrice près de
`.board-card__pills` et sur l'en-tête d'univers — et la même dans le popup de l'extension,
alimentée par la même colonne `origin`. Elle ne crée pas de filtre ni de section : elle
qualifie, elle ne range pas.

```
┌──────────────────────────────────────────────────────┐
│  Penduline                                           │
│                                                      │
│  Autoriser Claude Code ?                   (serif)   │
│                                                      │
│  Claude Code demande l'accès à votre Penduline.      │
│  Une fois autorisée, l'application pourra lire vos   │
│  univers, matrices et tâches, en créer, les          │
│  déplacer et les cocher.                             │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ Application   Claude Code                      │  │
│  │ Redirection   localhost:53682                  │  │
│  │ Compte        paul-emile@…                     │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Vous pourrez révoquer cet accès à tout moment       │
│  depuis « Applications connectées ».                 │
│                                                      │
│              [ Refuser ]      [ Autoriser ]          │
└──────────────────────────────────────────────────────┘
```

Un écran de consentement est un moment de confiance, et il se juge sur ce qu'il donne à
vérifier avant le clic. Trois informations sont obligatoires : le nom du client qui demande
(`client_name`, tel qu'enregistré par `/register`), l'hôte de la `redirect_uri` vers lequel
l'approbation renverra, et la portée réelle de l'accès dite en français courant — lecture et
écriture sur univers, matrices et tâches, sans distinction de portée puisque le ticket n'en
livre pas. L'hôte compte autant que le nom : l'enregistrement dynamique RFC 7591 est ouvert,
n'importe qui peut déclarer s'appeler « Claude Code », et c'est la destination qui trahit une
demande qui n'est pas celle qu'on attend. Elle s'affiche donc en hôte seul, pas en URL
complète, pour rester lisible d'un coup d'œil. Le compte connecté est rappelé parce qu'on
autorise depuis une session ouverte, parfois la mauvaise. Le refus est un chemin de premier
rang, pas un lien discret : les deux boutons sont côte à côte, « Autoriser » en accent,
« Refuser » en secondaire, et aucun des deux n'est présélectionné au point de se déclencher
par inadvertance. En aval, la modale « Applications connectées » est le pendant
indispensable de cette promesse : la phrase « vous pourrez révoquer » n'a de valeur que si
l'endroit existe et se trouve sans chercher. Elle liste les autorisations non révoquées avec
le nom au moment de l'autorisation, la date, et le dernier usage — ce dernier étant ce qui
permet de reconnaître une application oubliée. « Révoquer » passe par le `Confirm` existant,
et la révocation mord immédiatement côté serveur, ce que la formulation de confirmation doit
refléter sans promettre de délai. Cas limite à couvrir explicitement : liste vide (« Aucune
application connectée »), et `VITE_MCP_URL` absente au build, où l'écran de consentement
doit le dire franchement plutôt que d'échouer silencieusement sur le
`POST /authorize/decision`.

```
┌── Applications connectées ───────────────────  [ × ] ─┐
│                                                       │
│  Claude Code                                          │
│  Autorisée le 17 sept. · dernier usage il y a 2 min   │
│                                        [ Révoquer ]   │
│  ───────────────────────────────────────────────────  │
│  Un autre client                                      │
│  Autorisée le 3 sept. · dernier usage le 4 sept.      │
│                                        [ Révoquer ]   │
│                                                       │
│                                          [ Fermer ]   │
└───────────────────────────────────────────────────────┘
```

Côté accessibilité, trois contraintes sont fermes. La pastille porte son propre texte —
« agent » ou « créé par l'agent » selon la place — et ne repose jamais sur la couleur seule :
c'est la règle déjà écrite pour `.due` (`styles.css:651-653`), et elle vaut ici d'autant
plus que la distinction humain/agent est une information de provenance, pas un état visuel.
Sur la carte de tâche, la pastille s'insère dans la ligne du titre, qui est déjà dense
(titre repliable, échéance, raccourcis, bouton d'actions) : elle doit rester `flex: none` et
ne pas pousser le titre sous le seuil de lisibilité en largeur téléphone, quitte à se réduire
à un libellé plus court en dessous de 720 px. La modale réutilise `useDialog` sans exception :
piège de `Tab` confiné au panneau, `Échap` qui ferme avec `stopPropagation`, focus rendu à
l'élément d'origine au démontage — y compris lorsque cet élément a disparu, que le hook gère
déjà par `isConnected`. Elle hérite ainsi de `role="dialog"`, `aria-modal` et `tabIndex: -1`
par l'objet `surface`, et son bouton d'ouverture dans `.userbar__right` doit porter un
libellé explicite, jamais une icône seule. L'écran de consentement n'est pas une modale mais
un écran : un `h1` réel, un ordre de tabulation qui va du contenu aux deux boutons, et le
focus initial posé sur le titre plutôt que sur « Autoriser ». Enfin, toute règle `:hover`
introduite par ces trois surfaces vit sous `@media (hover: hover)` — `styles.test.ts`
l'impose par une égalité stricte n'admettant qu'une seule exception déjà inscrite, donc un
`:hover` nu fait tomber la suite, ce qui est le comportement voulu.
