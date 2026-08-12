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

## Ce qui reste, et qui n'est pas du code

**Compte développeur** — 5 $ une fois, sur
`chrome.google.com/webstore/devconsole`.

**Politique de confidentialité : obligatoire ici.** L'extension gère des comptes
et du contenu utilisateur, donc le Store exige une URL publique. À héberger, par
exemple sur `penduline.polemil.dev/confidentialite`. Elle doit dire quoi est
collecté (email, mot de passe, contenu des matrices), où ça part
(`api.penduline.polemil.dev`, instance Supabase auto-hébergée), et que rien n'est
revendu.

**Captures d'écran** — au moins une, 1280×800 ou 640×400. L'accueil du popup et
le détail d'une matrice suffisent.

**Déclarations du formulaire :**
- *Objet unique* : consulter et alimenter ses matrices d'Eisenhower.
- *Justification de `storage`* : conserver la session et la dernière matrice
  ouverte.
- *Justification de l'hôte* : joindre l'API de l'utilisateur, seule source de
  ses données.
- *Usage des données* : cocher « informations d'authentification » et
  « informations personnelles identifiables » (email). Certifier que rien n'est
  vendu, ni utilisé à des fins étrangères.

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
