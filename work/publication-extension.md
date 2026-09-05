# Publier l'extension sur le Chrome Web Store

Paquet produit par `npm run build:ext` puis un zip du contenu de
`apps/extension/dist`. Version courante : **1.4.0** (voir les notes de publication
plus bas) ; les versions antérieures restent décrites ici pour l'historique des
arbitrages.

> ⚠️ **La version publiée sur le Store est la 1.1.0.** Ni la 1.2.0 ni la 1.3.0
> n'ont jamais été soumises : la 1.4.0 emporte donc leurs changements, et la
> revue portera sur **trois versions d'un coup**. Voir les notes 1.4.0 plus bas,
> qui couvrent tout l'écart — c'est la seule section à lire pour remplir le
> formulaire.
>
> Pour mémoire : **1.2.0 = #87** (capture avec lien, dans un formulaire),
> **1.3.0 = #102** (passage au panneau latéral).

## Le numéro de version appartient à la SOUMISSION, pas à la PR

**Une PR de feature ne touche jamais à `version` dans le manifeste.** Le bump se
fait dans la PR qui prépare l'envoi au Store — celle qui porte aussi les notes de
publication et les vérifications de paquet.

**Pourquoi**, et ce n'est pas de la cosmétique : ce numéro a **un seul
consommateur**, le Chrome Web Store, et **un seul sens** — quel paquet est
installé chez les gens. Seule une soumission en crée un. Le bumper à chaque PR le
transforme en compteur de PR, et il cesse de répondre à la seule question qu'on
lui pose.

C'est ce qui s'est produit entre la 1.1.0 et la 1.4.0, et les trois symptômes
valent d'être connus :

1. **Trois numéros, un seul publié.** 1.2.0 et 1.3.0 désignent des paquets qui
   n'ont jamais existé ailleurs que dans git. La section « Version 1.3.0 — notes
   de publication » plus bas décrit ainsi une publication qui n'a pas eu lieu :
   elle est conservée pour l'historique des arbitrages, **pas** comme la trace
   d'un envoi.
2. **Le numéro a cessé d'identifier un build.** #107 a modifié le manifeste sans
   bumper — « 1.3.0 » a désigné deux paquets différents à deux moments.
3. **Les notes se fragmentent.** Le découpage par version suppose une version =
   une soumission. Quand trois partent ensemble, le périmètre réel doit être
   reconstitué depuis l'historique.

> ⚠️ **Ne pas recycler un numéro brûlé.** 1.2.0 et 1.3.0 nomment déjà des arbres
> précis dans l'historique (`2ddd805` et `604a64a`). Les réattribuer à une
> soumission au contenu différent rejouerait exactement le défaut ci-dessus. Un
> saut dans la séquence ne se voit nulle part : les utilisateurs ne voient que
> les versions publiées. Et un numéro téléversé ne serait-ce qu'en brouillon est
> réservé côté Store, publié ou non.

La version de la racine (`package.json`, `0.0.x`) suit une autre logique et n'a
pas ce problème : elle marque un état de `main`, aucun tiers ne la lit, elle ne
peut pas mentir. Les deux ne sont pas synchronisées, et il n'y a pas de raison
qu'elles le soient.

## ⚠️ Deux vérifications AVANT de zipper — depuis la 1.4.0

Le partage de session (#107) fait dépendre le paquet de son **environnement de
build**. Ce sont les deux seules choses qui peuvent produire un zip d'apparence
correcte et fonctionnellement mort.

**1. `VITE_WEB_APP_URL` doit valoir l'URL de production.** Le service worker
n'accepte une session que d'une origine exactement égale à celle-ci
(`src/web-app.ts` → `src/session-bridge.ts`). Le défaut du code est
`http://localhost:5173` : un paquet construit avec un `.env` de développement
n'accepterait donc que le serveur local, et le partage serait mort en production.

```bash
grep VITE_WEB_APP_URL .env      # doit dire https://penduline.polemil.dev
```

**2. `externally_connectable` ne doit lister QUE l'origine de production.** C'est
l'état du manifeste versionné — ne pas le commiter autrement.

### Tester en local malgré ça

Les match patterns **n'acceptent pas de port** : la ligne à ajouter est
`http://localhost/*`, jamais `http://localhost:5173/*` (invalide, et un manifeste
invalide empêche l'extension ENTIÈRE de se charger).

À ajouter **dans `dist/manifest.json` après le build**, jamais dans
`public/manifest.json` — sinon elle part au Store. Un paquet publié qui liste
`localhost` autorise n'importe quelle page servie localement sur la machine de
l'utilisateur à parler à l'extension.

```bash
npm run build:ext
# puis, à la main dans apps/extension/dist/manifest.json :
#   "matches": ["https://penduline.polemil.dev/*", "http://localhost/*"]
```

Et côté app web, `VITE_EXTENSION_ID` doit porter l'ID affiché par
`chrome://extensions` — il dérive du CHEMIN du dossier chargé, il n'est donc pas
celui du Store et diffère d'une machine à l'autre.

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
attendu. L'interface y est composée dans un cadre, avec une accroche à gauche.

> ⚠️ **À REFAIRE avant la soumission 1.4.0 — ce n'est pas de la cosmétique.**
> Les captures en ligne montrent le popup à ses dimensions d'alors (400×600), et
> elles sont **exactes pour la 1.1.0**, seule version publiée. C'est justement le
> problème : l'extension change d'hôte dans cette soumission, et une fiche qui
> montre encore un popup décrirait un autre produit.
>
> La composer à une largeur de panneau plausible (~400 px) *le long du bord droit
> d'une fenêtre de navigateur*, et non en vignette flottante — c'est la
> différence que la fiche doit montrer. Le bandeau « Aujourd'hui » et le badge
> sur l'icône méritent d'y figurer.

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
> pour éviter à l'utilisateur de se reconnecter à chaque ouverture du panneau, et
> l'identifiant de la dernière matrice consultée, afin de la rouvrir directement
> pendant deux heures. Rien n'est transmis à un tiers.

**Justification de la permission `contextMenus`** *(nouveau en 1.1.0)*

> L'extension ajoute une entrée « Ajouter à Penduline » au menu contextuel, pour
> créer une tâche à partir d'un texte sélectionné, d'un lien ou de la page en
> cours. Cette permission sert uniquement à afficher cette entrée. Elle
> n'accorde aucun accès au contenu des pages : l'extension ne reçoit que ce que
> l'utilisateur a lui-même sélectionné, et seulement au moment où il clique sur
> l'entrée.

**Justification de la permission `sidePanel`** *(écrite pour la 1.3.0, jamais
soumise — c'est donc une **nouvelle permission** pour la fiche en 1.4.0)*

> L'extension affiche son interface dans le panneau latéral du navigateur plutôt
> que dans une fenêtre surgissante, afin que l'utilisateur puisse consulter ses
> tâches tout en naviguant. Cette permission sert uniquement à afficher ce
> panneau. Elle n'accorde aucun accès au contenu des pages et ne change rien aux
> données manipulées.

**Autorisation d'hôte** — il n'y en a toujours pas. Rien à justifier, et pas
d'examen approfondi. L'extension joint son API par un `fetch` cross-origin
classique, autorisé par les en-têtes CORS du serveur. À noter : ni `contextMenus`
ni `sidePanel` n'affichent **d'avertissement à l'installation** — le manifeste
reste sobre. La ligne à ne pas franchir est `host_permissions`, et elle seule.

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

**Sept changements, livrés en une seule version.** Chaque soumission repasse en
revue : les étaler aurait coûté sept examens pour une semaine de travail.

**Corrections**

- La case « À trier » n'apparaissait pas dans le popup. Les tâches qui y étaient
  rangées depuis le web y étaient donc invisibles — ce qui se lit comme une perte
  de données, pas comme un défaut d'affichage.
- Le popup **cassait les appairages** créés sur le web : épingler ou déplacer une
  tâche rompait le lien en silence. Il le préserve désormais, et déplace les deux
  tâches ensemble.

**Nouveautés**

- **Créer une matrice depuis le popup.** Un compte neuf n'oblige plus à quitter
  l'extension à sa toute première utilisation.
- **Capture depuis la page consultée** par le menu contextuel, sur une sélection,
  un lien ou la page.
- **Renommer une tâche** et **la déplacer** — vers une autre case ou une autre
  matrice — depuis un nouveau menu sur la carte.
- Le sélecteur de case se lit comme **une seule matrice** : coins extérieurs
  arrondis, cinquième zone au centre.
- Le popup affiche un **écran de chargement** au lieu d'une fenêtre vide.

**Ce qui touche la fiche du Store**

Un seul point : la **capture contextuelle**, qui ajoute la permission
`contextMenus` et fait cocher « contenu des sites web » dans la déclaration
d'usage des données (voir plus haut). Les six autres changements sont internes.

**Texte court pour la fiche :**

> Nouveau : ajoutez une tâche depuis n'importe quelle page par un clic droit,
> créez et renommez directement dans l'extension, et déplacez vos tâches d'une
> matrice à l'autre. La case « À trier » s'affiche désormais correctement.

## Version 1.3.0 — notes de publication

> ⚠️ **Jamais soumise.** Cette section décrit un bump, pas un envoi — voir « Le
> numéro de version appartient à la soumission » plus haut. Son contenu part
> dans la 1.4.0, et les arbitrages qu'elle documente restent valables.

**L'extension passe du popup au panneau latéral.** Aucune fonctionnalité ne
change : mêmes écrans, mêmes gestes, mêmes données. C'est l'hôte qui bouge.

**Ce que ça débloque**

- Le panneau **ne se ferme plus quand on clique dans la page**. C'était la
  contrainte structurante du popup : relire un article pendant qu'on corrige le
  titre de la tâche qu'on vient d'en tirer était impossible, alors que c'est
  exactement le geste pour lequel le formulaire de capture existe.
- Il **reste ouvert en changeant d'onglet** : la matrice devient consultable
  pendant qu'on travaille.
- Il occupe **toute la hauteur** de la fenêtre et se **redimensionne** — la mise
  en page est passée en fluide, testée de 240 px (minimum imposé par Chrome) à
  plusieurs centaines.

**Ce qui touche la fiche du Store**

- **Permission `sidePanel`** ajoutée (justification plus haut). Aucun
  avertissement à l'installation, revue standard : `host_permissions` reste
  absent.
- **`minimum_chrome_version: "116"`**. L'API `chrome.sidePanel` date de Chrome
  114, mais `sidePanel.open()` — dont dépend l'ouverture depuis le menu
  contextuel — n'arrive qu'en 116. Déclarer 114 laisserait installer l'extension
  sur des versions où la capture par clic droit retomberait systématiquement sur
  l'écriture directe, sans formulaire.
- **`action.default_popup` retiré du manifeste.** Ce n'est pas un détail
  d'écriture : tant qu'il est là, il gagne sur `setPanelBehavior`, et le clic sur
  l'icône continuerait d'ouvrir une fenêtre surgissante. Ne pas le remettre.
- Les **captures d'écran de la fiche** sont à refaire : elles montrent un popup.

**Texte court pour la fiche :**

> Penduline s'installe désormais dans le panneau latéral : vos matrices restent
> sous les yeux pendant que vous naviguez, et la fenêtre ne se referme plus au
> premier clic dans la page.

## Version 1.4.0 — notes de publication

> ⚠️ **Cette soumission part d'une fiche en 1.1.0**, la 1.2.0 et la 1.3.0
> n'ayant jamais été envoyées. Douze commits séparent les deux. Ce qui suit
> couvre **tout l'écart**, pas seulement la 1.4.0 — remplir le formulaire à
> partir des seules nouveautés 1.4.0 déclarerait moins que la réalité.

### Ce qui touche la fiche du Store

| Élément | Venu de | À faire |
|---|---|---|
| Permission **`sidePanel`** | 1.3.0 | **Nouvelle pour la fiche** — justification déjà rédigée plus haut, à coller |
| `minimum_chrome_version: "116"` | 1.3.0 | Nouveau. `sidePanel.open()` n'existe qu'à partir de 116 |
| `action.default_popup` retiré | 1.3.0 | Rien à déclarer, mais ne pas le remettre |
| **`externally_connectable`** | 1.4.0 | Pas une permission : aucun avertissement, rien à justifier |
| **Captures d'écran** | 1.3.0 | **Obligatoire.** Celles en ligne montrent un popup — et elles sont exactes pour la 1.1.0. Le produit change d'hôte, la fiche doit le montrer |
| Usage des données | — | **Inchangé depuis la 1.1.0.** Voir ci-dessous |
| Autorisation d'hôte | — | Toujours aucune → revue standard |

**L'usage des données ne bouge pas, et c'est à vérifier plutôt qu'à croire.** La
capture contextuelle (« contenu des sites web ») était déjà déclarée en 1.1.0. Le
formulaire de capture avec lien (#87) reste dans cette catégorie. Le partage de
session (#107) fait arriver le jeton par un second chemin, mais « informations
d'authentification » était déjà coché et couvre exactement ça.

### Les changements, par ordre d'importance pour l'utilisateur

**L'extension passe du popup au panneau latéral** (#102, ex-1.3.0). C'est le
changement structurant : le panneau ne se ferme plus au clic dans la page, reste
ouvert en changeant d'onglet, occupe toute la hauteur. Le détail est dans les
notes 1.3.0 ci-dessus, qui restent valables.

**Nouveautés**

- **Un badge sur l'icône** (#108) : le nombre de tâches du jour restantes, sans
  rien ouvrir. Zéro efface le badge plutôt que d'écrire « 0 ».
- **Se connecter sur l'app web connecte l'extension** (#107). Plus de seconde
  saisie de mot de passe ; la déconnexion est propagée elle aussi.
- **Le bandeau « Aujourd'hui »** dans le panneau (#104).
- **Capturer une tâche avec son lien**, dans un formulaire (#87, ex-1.2.0).
- **Poser une échéance**, la voir, et faire remonter les dépassées (#97).
- **Des étapes sur une tâche**, sur un seul niveau (#86).
- **Regrouper les matrices en univers** (#62).
- **Renommer une tâche, la changer de matrice** (#58).

**Corrections et fond**

- Plus de menu contextuel en doublon à l'installation (#106).
- Les échecs d'écriture deviennent visibles et réversibles (#77).
- Ne plus charger ce qu'on n'affiche pas (#82) — l'ouverture du panneau est le
  premier travail perçu.
- Le placement de la tâche partenaire corrigé (#61).

**Texte court pour la fiche :**

> Penduline s'installe désormais dans le panneau latéral : vos matrices restent
> sous les yeux pendant que vous naviguez. Votre icône affiche ce qu'il vous
> reste à faire aujourd'hui, et vous n'avez plus à vous connecter deux fois —
> ouvrir Penduline sur le web connecte aussi l'extension.

## Le point à peser avant de publier

**L'inscription est ouverte.** `DISABLE_SIGNUP` vaut toujours `false` sur l'API.
Une extension publique signifie que n'importe quel installateur peut créer un
compte sur ton serveur — sur une machine à 4 Go déjà juste. À basculer à `true`
avant publication si l'extension n'est pas destinée à d'autres que toi.

> **Caduc depuis la 1.1.0** — laissé pour mémoire, parce que le conseil est
> devenu dangereux. La 1.0.0 notait que « le service worker ne fait rien » et
> qu'on pouvait donc *retirer `background` du manifest*. Il porte désormais les
> menus contextuels, le retour par pastille et le client Supabase :
> le retirer casserait la capture depuis la page consultée, qui est la
> nouveauté visible de cette version.

## Empaqueter

```bash
npm run build:ext
cd apps/extension/dist && zip -qr ../penduline-extension-v<version>.zip . -x '.*'
```

Le zip contient le **contenu** de `dist/`, pas le dossier lui-même — le Store
refuse une archive dont le `manifest.json` n'est pas à la racine. Le `-x '.*'`
écarte les fichiers cachés qu'un système peut y déposer.

Vérifier avant de soumettre : la version lue **dans le zip**, l'absence de
`.map` et de sources, et la liste des permissions.

```bash
unzip -p apps/extension/penduline-extension-v<version>.zip manifest.json \
  | python3 -c "import json,sys; m=json.load(sys.stdin); print(m['version'], m.get('permissions'))"
```
