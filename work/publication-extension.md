# Publier l'extension sur le Chrome Web Store

Paquet produit par `npm run build:ext` puis un zip du contenu de
`apps/extension/dist`. Version courante : **1.1.0** (voir les notes de publication
plus bas) ; la 1.0.0 reste décrite ici pour l'historique des arbitrages.

## Corrections faites pour la publication

**Les polices sont embarquées.** Le popup chargeait Caprasimo et Figtree depuis
Google Fonts. Une extension publiée ne doit pas dépendre d'un CDN : chaque
ouverture aurait envoyé une requête à un tiers — à déclarer dans le formulaire
d'usage des données — et le rendu se dégradait hors ligne. Sous-ensemble
« latin », qui couvre les accents français dont `œ`. Figtree étant une fonte
variable, un seul fichier sert les graisses 400 à 700. Coût : +40 Ko.

**`host_permissions` retiré entièrement.** Il déclarait au départ trois hôtes,
dont deux inutilisés. Mais la bonne réponse était de tout supprimer : en MV3, un
`fetch()` cross-origin depuis l'extension aboutit **sans autorisation d'hôte** dès
lors que le serveur renvoie les en-têtes CORS voulus — et Kong répond
`Access-Control-Allow-Origin: *` en reflétant les en-têtes demandés (`apikey`,
`authorization`, `prefer`, `x-client-info`…).

Vérifié de deux façons : préflights `POST /auth/v1/token`, `GET /rest/v1/boards`
et `PATCH /rest/v1/tasks` avec une origine `chrome-extension://` (tous 200) ; et
surtout le popup servi depuis une origine étrangère, sans la moindre autorisation,
qui exécute son rafraîchissement de jeton et ses deux lectures en 200.

L'enjeu est concret : déclarer une autorisation d'hôte déclenche un **examen
approfondi** du Store, qui retarde la publication. Sans elle, il ne reste que
`storage`, et la revue est standard.

**Contrepartie à connaître :** ça repose sur le CORS permissif de l'API. Si tu
restreins un jour `Access-Control-Allow-Origin` sur Kong, l'extension cessera de
fonctionner et il faudra remettre `host_permissions` — en acceptant l'examen
approfondi.

**Version passée à 1.0.0.**

## Politique de confidentialité

Publiée à `https://penduline.polemil.dev/confidentialite`
(`apps/web/public/confidentialite/index.html`). Page autonome : aucune police
distante, aucun script, pour rester lisible même si l'application est en panne.
C'est cette URL à renseigner dans la fiche du Store — elle est **obligatoire**,
l'extension gérant des comptes et du contenu utilisateur.

## Captures d'écran

`apps/extension/store/01-liste.png` et `02-matrice.png`, 1280×800, le format
attendu. Le popup y est composé à ses dimensions réelles (400×600) dans un cadre,
avec une accroche à gauche.

**Elles utilisent du contenu de démonstration neutre, volontairement.** Les vraies
tâches du compte de test nommaient des projets clients — les publier sur le Store
les aurait rendues publiques. La matrice de démonstration a été supprimée après
coup.

## Textes à coller dans le formulaire

**Objet unique**

> Penduline permet de consulter et d'alimenter ses propres matrices d'Eisenhower,
> hébergées sur son compte Penduline. L'extension n'a aucune autre fonction.

**Justification de la permission `storage`**

> L'extension conserve deux choses dans le stockage local : le jeton de session,
> pour éviter à l'utilisateur de se reconnecter à chaque ouverture du popup, et
> l'identifiant de la dernière matrice consultée, afin de la rouvrir directement
> pendant deux heures. Rien n'est transmis à un tiers.

**Justification de la permission `contextMenus`** *(nouveau en 1.1.0)*

> L'extension ajoute une entrée « Ajouter à Penduline » au menu contextuel, pour
> créer une tâche à partir d'un texte sélectionné, d'un lien ou de la page en
> cours. Cette permission sert uniquement à afficher cette entrée. Elle
> n'accorde aucun accès au contenu des pages : l'extension ne reçoit que ce que
> l'utilisateur a lui-même sélectionné, et seulement au moment où il clique sur
> l'entrée.

**Autorisation d'hôte** — il n'y en a toujours pas. Rien à justifier, et pas
d'examen approfondi. L'extension joint son API par un `fetch` cross-origin
classique, autorisé par les en-têtes CORS du serveur. À noter : `contextMenus`
n'affiche **aucun avertissement à l'installation** — le manifeste reste sobre.

**Code distant** — répondre non : le paquet ne charge ni script ni ressource
externe.

**Usage des données** — cocher :
- *Informations permettant d'identifier une personne* : l'adresse e-mail du compte.
- *Informations d'authentification* : le mot de passe à la connexion, et le jeton
  de session.
- *Contenu des sites web* ⚠️ **à cocher depuis la 1.1.0** — voir ci-dessous.

> ⚠️ **La capture contextuelle change cette déclaration.** Jusqu'en 1.0.0 la case
> « contenu des sites web » devait rester décochée, l'extension ne lisant aucune
> page. Depuis la 1.1.0 elle reçoit le texte sélectionné, l'URL du lien visé ou le
> titre de la page — ce qui relève de cette catégorie au sens du formulaire, même
> si la lecture est déclenchée par l'utilisateur et limitée à ce qu'il a désigné.
> Déclarer moins que la réalité est le meilleur moyen de se faire retirer.

Justification à joindre :

> Lorsque l'utilisateur choisit « Ajouter à Penduline » dans le menu contextuel,
> le texte qu'il a sélectionné (ou, à défaut, l'adresse du lien ou le titre de la
> page) devient l'intitulé de la tâche créée dans son propre compte. Rien n'est
> lu en dehors de cette action explicite, rien n'est transmis à un tiers, et
> aucune page n'est parcourue en arrière-plan.

Ne PAS cocher activité de navigation, localisation ni communications
personnelles : l'extension ne suit aucune navigation et ne lit rien de sa propre
initiative.

Puis certifier les trois points : données non revendues, non utilisées à des fins
étrangères à l'objet unique, non utilisées pour évaluer une solvabilité.

**Description proposée pour la fiche**

> Urgent n'est pas important. Penduline range vos tâches selon ces deux axes —
> faire, planifier, déléguer, éliminer — et vous les rend en un clic depuis votre
> barre d'outils.
>
> Organisez autant de matrices que vous voulez, selon le découpage qui vous
> convient : un lieu, un moment de la journée, un projet. L'extension retrouve la
> dernière matrice consultée, affiche d'un coup d'œil ce qui reste ouvert, et
> permet d'ajouter une tâche directement dans la bonne case.
>
> Un compte Penduline est nécessaire. Vos données restent les vôtres : rien n'est
> revendu, aucun traceur, aucune mesure d'audience.

Compter quelques jours de revue.

## Version 1.1.0 — notes de publication

Quatre changements, livrés ensemble parce que **chaque version repasse en revue** :
les séparer coûtait quatre examens pour trois jours de travail.

- **Correction** : la case « À trier » n'apparaissait pas dans le popup. Les tâches
  qui y étaient rangées depuis le web étaient donc invisibles dans l'extension —
  ce qui se lisait comme une perte de données, pas comme un défaut d'affichage.
- On peut désormais **créer une matrice depuis le popup**. Un compte neuf n'oblige
  plus à quitter l'extension à sa toute première utilisation.
- Le sélecteur de case se lit comme **une seule matrice** : coins extérieurs
  arrondis, cinquième zone au centre.
- **Capture depuis la page consultée** par le menu contextuel, sur une sélection,
  un lien ou la page.

Seul le dernier point touche au manifeste (`contextMenus`) et à la déclaration
d'usage des données.

**Texte court pour la fiche :**

> Nouveau : ajoutez une tâche depuis n'importe quelle page par un clic droit, et
> créez vos matrices directement dans l'extension. La case « À trier » s'affiche
> désormais correctement.

## Deux points à peser avant de publier

**L'inscription est ouverte.** `DISABLE_SIGNUP` vaut toujours `false` sur l'API.
Une extension publique signifie que n'importe quel installateur peut créer un
compte sur ton serveur — sur une machine à 4 Go déjà juste. À basculer à `true`
avant publication si l'extension n'est pas destinée à d'autres que toi.

**Le service worker ne fait rien** (un `console.log` sur `onInstalled`). Ce n'est
pas rédhibitoire, mais un `background` sans usage réel peut appeler une question
en revue. Il est prévu pour la synchro de session et les rappels ; à défaut, on
peut le retirer du manifest.
