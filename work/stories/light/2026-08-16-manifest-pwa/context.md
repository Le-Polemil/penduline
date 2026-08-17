---
story: "Manifest PWA : rendre l'app installable"
story_code: "manifest-pwa"
issues: [41]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Penduline est un outil qu'on ouvre plusieurs fois par jour. Sur mobile, chacune de ces
ouvertures repasse aujourd'hui par le navigateur : trouver l'onglet, ou retaper l'adresse,
puis subir la barre d'adresse qui mange un dixième de l'écran. L'app n'a pas d'icône sur
l'écran d'accueil parce qu'elle n'a pas de manifeste — et sans manifeste, ni Android ni
iOS ne proposent l'ajout.

Ce que la story livre est donc court à décrire : **l'app devient installable**. Depuis
Chrome sur Android, elle apparaît dans le menu et, une fois le service worker en place,
via l'invite d'installation. Depuis Safari sur iOS, « Sur l'écran d'accueil » lui donne la
bonne icône et un lancement plein cadre. Rien ne change pour qui reste dans un onglet :
aucune interface n'est ajoutée, aucun bouton, aucun parcours.

Le second bénéfice est en amont du produit. **#30 (notifications push) en dépend
directement** : sur iOS, le Web Push n'existe que pour une PWA installée depuis l'écran
d'accueil. Sans ce ticket, la moitié du parcours de #30 est structurellement infaisable.
C'est ce qui justifie de le traiter avant, alors qu'il ne débloque rien d'autre.

Critères d'acceptation : installable sur Android et iOS, icône correcte y compris en forme
masquée (le cercle d'Android rogne sans pitié une icône qui ne prévoit pas sa zone sûre),
lancement sans barre d'adresse, et couleur de thème cohérente avec la palette.

## Vue architecturale

Cinq fichiers, dont un seul contient de la logique. Le poids de la story n'est pas dans
son volume mais dans une décision.

```
  apps/web/
    index.html        ← <link rel="manifest">
    nginx.conf        ← MIME .webmanifest + no-cache sur sw.js
    src/main.tsx      ← enregistrement, gardé par import.meta.env.PROD
    public/
      manifest.webmanifest   (nouveau)
      sw.js                  (nouveau) ← la seule décision réelle
      icon-{192,512}.png              \ dérivés de icon.svg
      icon-maskable-{192,512}.png     / par sips, commités
```

**La décision : poser un service worker qui ne met rien en cache.** Chrome a retiré
l'exigence de service worker pour l'installation via le menu ⋮ (v108 mobile, v112 desktop),
mais l'**invite automatique** — `beforeinstallprompt` — exige toujours que la page soit
contrôlée par un service worker écoutant `fetch`. Le ticket demande explicitement de
vérifier cette invite. On accepte donc un fichier dont l'existence tient à un critère de
navigateur, pas à un besoin fonctionnel, et on l'écrit noir sur blanc en tête du fichier :
un service worker sans logique apparente est exactement le genre de code qu'une relecture
supprime comme mort.

Ce qu'on refuse en revanche, c'est le cache d'app shell qui accompagne d'ordinaire un
service worker. Mettre le bundle en cache ferait cohabiter deux versions de l'application
et rendrait un déploiement invisible aux onglets déjà ouverts — précisément le problème
que `nginx.conf` évite déjà en interdisant la mise en cache d'`index.html`. Le service
worker se limite donc à un passe-plat sur les navigations : assez pour ne pas être
classé « no-op » et ignoré par Chrome, assez étroit pour que le trafic Supabase ne le
traverse pas.

```
  requête ─┬─ mode: navigate ──→ sw ──→ respondWith(fetch(req))  ← le strict minimum
           └─ tout le reste   ──────→ réseau, sans passer par le sw
```

**Corollaire côté nginx** : `sw.js` et le manifeste doivent être servis en `no-cache`.
Un service worker mis en cache un an est impossible à corriger à distance — il resterait
servi aux clients bien après qu'on ait poussé le correctif. Le `location /assets/` actuel
ne les couvre pas (ils ne sont pas hashés par Vite), mais l'implicite ne suffit pas ici :
on rend la règle explicite, comme pour `index.html`. Même logique pour le type MIME
`application/manifest+json`, que l'image `nginx:alpine` ne garantit pas.

`skipWaiting` + `clients.claim` répondent au même risque sous un autre angle : un service
worker est collant, et sans eux une version corrigée resterait bloquée en attente derrière
l'ancienne jusqu'à ce que l'utilisateur ferme tous ses onglets.

## Impacts UX

Aucune interface n'est ajoutée, mais l'app gagne un contexte d'affichage qu'elle n'avait
pas : `display: standalone`. Lancée depuis l'écran d'accueil, elle perd la barre d'adresse
et récupère la hauteur correspondante. Le `viewport-fit=cover` déjà présent dans
`index.html` la prépare à ce mode, où les zones sûres de l'appareil (encoche, barre
gestuelle) deviennent la seule contrainte de bord.

Le point de soin est l'**icône masquée**. Android inscrit l'icône dans une forme — cercle
le plus souvent — et rogne tout ce qui déborde d'une zone sûre de 80 % du côté. Le nid de
Penduline remplit toute la hauteur de son viewBox : tel quel, il ressortirait décapité.
D'où une variante dédiée, le nid réduit à environ deux tiers du canevas sur un fond crème
`#f5ead8` — exactement la recette déjà appliquée à `apple-touch-icon.png`, qui garde donc
l'icône cohérente entre iOS et Android plutôt que d'inventer un second traitement.

`theme_color` et `background_color` reprennent `--color-bg` (`#f5ead8`), déjà déclaré en
`<meta name="theme-color">`. C'est ce qui colore la barre système en mode installé et
l'écran de démarrage : une valeur divergente produirait un flash d'une autre couleur au
lancement, à l'endroit le plus visible du parcours.
