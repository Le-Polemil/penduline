# Publier l'extension sur le Chrome Web Store

Paquet prêt : `apps/extension/penduline-extension-v1.0.0.zip` (165 Ko), produit par
`npm run build:ext` puis un zip du contenu de `apps/extension/dist`.

## Corrections faites pour la publication

**Les polices sont embarquées.** Le popup chargeait Caprasimo et Figtree depuis
Google Fonts. Une extension publiée ne doit pas dépendre d'un CDN : chaque
ouverture aurait envoyé une requête à un tiers — à déclarer dans le formulaire
d'usage des données — et le rendu se dégradait hors ligne. Sous-ensemble
« latin », qui couvre les accents français dont `œ`. Figtree étant une fonte
variable, un seul fichier sert les graisses 400 à 700. Coût : +40 Ko.

**`host_permissions` réduit à `https://api.penduline.polemil.dev/*`.** Il
déclarait aussi `https://*.supabase.co/*` (inutilisé : le build pointe sur le
domaine propre) et `http://127.0.0.1/*` (dev local). Les permissions larges ou
injustifiées sont un motif classique de rejet.

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

**Justification de l'accès à `https://api.penduline.polemil.dev/*`**

> C'est l'API de Penduline, seule source des données de l'utilisateur.
> L'extension s'y authentifie, y lit et y écrit ses matrices et ses tâches.
> Aucun autre domaine n'est contacté : les polices sont embarquées dans le paquet.

**Code distant** — répondre non : le paquet ne charge ni script ni ressource
externe.

**Usage des données** — cocher :
- *Informations permettant d'identifier une personne* : l'adresse e-mail du compte.
- *Informations d'authentification* : le mot de passe à la connexion, et le jeton
  de session.

Ne PAS cocher activité de navigation, contenu des sites web, localisation ni
communications personnelles : l'extension ne lit aucune page.

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

## Deux points à peser avant de publier

**L'inscription est ouverte.** `DISABLE_SIGNUP` vaut toujours `false` sur l'API.
Une extension publique signifie que n'importe quel installateur peut créer un
compte sur ton serveur — sur une machine à 4 Go déjà juste. À basculer à `true`
avant publication si l'extension n'est pas destinée à d'autres que toi.

**Le service worker ne fait rien** (un `console.log` sur `onInstalled`). Ce n'est
pas rédhibitoire, mais un `background` sans usage réel peut appeler une question
en revue. Il est prévu pour la synchro de session et les rappels ; à défaut, on
peut le retirer du manifest.
