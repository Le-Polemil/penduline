---
story: "Lot Vague 1 — extension"
story_code: "extension-vague-1"
issues: [11, 29, 16, 52]
created: 2026-08-16
status: "In Progress"
---

# Lot Vague 1 — extension (#11, #29, #16, #52)

## Contexte

Quatre tickets touchent le popup de l'extension. Ils partent **ensemble, sur une
seule branche et une seule release Chrome Web Store** : chaque version repasse en
review, et #52 modifie le manifeste. Les livrer séparément coûterait quatre
examens pour trois jours de travail.

L'ordre interne n'est pas indifférent : **#11 doit précéder #16**. #11 fait
apparaître une cinquième case dans une grille aujourd'hui câblée en 2×2
(`.squares { grid-template-columns: 1fr 1fr }`) — livré seul, il produirait un
carré orphelin sur une troisième ligne. #16 est précisément ce qui donne sa
géométrie à ce cinquième élément.

### Ce que chaque ticket corrige

**#11** — `apps/extension/src/App.tsx` itère sur `QUADS` (4 cases) au lieu de
`ALL` (5) à trois endroits : `:257` carrés de filtre, `:291` liste des cases,
`:399` carrés d'ajout. Les tâches « À trier » créées sur le web sont donc
**invisibles dans l'extension** — ce qui se lit comme une perte de données, pas
comme un manque d'affichage.

**#29** — `ExtStore` (`store.ts:8`) n'expose que `addTask` et `patchTask`. Un
compte neuf affiche « Aucune matrice. Ouvre l'app pour commencer. » (`:138`) :
la toute première utilisation force à quitter l'extension.

**#16** — Les carrés de sélection doivent se lire comme **une matrice** : coins
extérieurs arrondis, coins centraux carrés, plus un cinquième élément rond au
centre pour « À trier ».

**#52** — L'extension ne fait que consulter. Un menu contextuel la ferait entrer
dans le flux de navigation, là où naissent la plupart des tâches.

---

## Tâches

### 1. #11 — Afficher « À trier »

Remplacer `QUADS` par `ALL` aux trois itérations. `PARK.bg` vaut `'transparent'` :
reprendre le repli neutre déjà appliqué côté web (`apps/web/src/screens/Matrix.tsx:535`)
plutôt que d'inventer une seconde convention.

Vérifier que `listFor()` et `countOpen()` se comportent bien sur `parking` — ils
filtrent sur `quadrant`, donc rien à changer a priori, mais c'est à confirmer à
l'écran.

> **Asymétrie connue, hors périmètre** : les pastilles de l'accueil (`:150`, web
> comme extension) comptent sur `QUADS` et ignorent donc le parking, alors que le
> compteur total l'inclut. Une matrice ne contenant que des tâches « À trier »
> apparaît active mais sans pastille. Comportement préexistant et identique sur
> les deux plateformes : à traiter à part, pas ici.

### 2. #29 — Créer une matrice depuis le popup

- `addBoard(name)` dans `ExtStore`, en miroir de `apps/web/src/data/store.ts:47` :
  `position` = `max + 1`, insertion avec `user_id`, mise à jour de l'état local.
- Formulaire dans l'accueil du popup, sur le motif du web (`Home.tsx:162`) :
  bouton au repos, champ à la saisie, Entrée valide, Échap annule — **adapté à la
  largeur contrainte du popup**, le formulaire pleine largeur du web ne se
  transpose pas.
- L'état vide doit proposer la création sur place, au lieu de renvoyer au web.
- Pas de nom par défaut, pas de matrice semée : règle du projet (README).

### 3. #16 — Géométrie des carrés, avec maquette Claude Design

**Maquette d'abord.** Le projet **« Organic »** (`7d3fcc3c-…`) est le design
system du produit, celui que citent `quadrants.ts` et le README. On y pousse un
nouveau composant :

```
components/quadrant-picker.html
```

Convention relevée sur `components/buttons.html` : marqueur `@dsCard` en première
ligne, `<link rel="stylesheet" href="../styles.css">`, échafaudage de démo dans un
`<style>` local, contenu **en anglais** (le DS est en anglais, contrairement à
l'app).

La page présente **3 à 4 variantes** de géométrie du rond central, à taille réelle
et agrandie. Points durs à arbitrer :

- le rond chevauche la jonction de **quatre fonds de couleurs différentes** — il
  lui faut un détourage qui tienne sur les quatre ;
- à 16 px de côté par carré, le rond ne peut pas dépasser ~10 px sans manger les
  compteurs ;
- l'état sélectionné doit rester lisible sur les cinq éléments, alors que
  l'existant repose sur `outline: 2px solid var(--color-text)`.

**Après validation**, intégration en CSS sur `.squares` / `.square` et
`.add-squares` / `.add-square` : coins extérieurs arrondis, coins centraux carrés,
élément central en `position: absolute` centré sur la grille.

### 4. #52 — Capture depuis la page consultée

**Menus** (`background.ts`, aujourd'hui 6 lignes) :

- Entrée directe « Ajouter à Penduline » → **dernière matrice active**
  (`getActiveBoard()`, `store.ts:64`, TTL 2 h).
- Sous-menu « Autre matrice › » listant les autres.
- Contextes : `selection`, `link`, `page`.

**Titre de la tâche** : texte sélectionné, sinon titre du lien, sinon titre de la
page. Case d'arrivée : **« À trier »** — ce qui est capturé à la volée n'a par
définition pas été classé, et c'est la raison d'être du parking.

**Session dans le service worker** : `chromeStorage` (`storage.ts`) a été écrit
dès l'origine pour fonctionner dans le worker MV3, où `localStorage` n'existe pas.
Le worker peut donc instancier le même client et lire la session — rien à
réarchitecturer.

**Rafraîchir la liste des matrices** : `chrome.contextMenus` exige des menus
enregistrés à l'avance. Plutôt que de faire interroger Supabase par le worker, le
**popup lui transmet la liste** qu'il a déjà chargée, via `chrome.runtime.sendMessage`.
Reconstruction aussi sur `onInstalled` et `onStartup`, depuis un cache
`chrome.storage.local`.

**Retour visuel : le badge de l'icône**, pas une notification.
`chrome.notifications` exigerait une **permission supplémentaire**, alors que tout
le travail de `work/publication-extension.md` a consisté à garder un manifeste
minimal. `chrome.action.setBadgeText` ne coûte rien.

- Succès → badge « ✓ » vert ~2 s.
- Aucune session → badge « ! » + `setTitle` expliquant qu'il faut se connecter.

**Manifeste** : ajouter `contextMenus` aux permissions (aujourd'hui `["storage"]`)
et passer la version à **1.1.0**. `contextMenus` n'affiche **aucun avertissement
d'installation**, mais toute modification du manifeste repasse en review.

### 5. Documentation

- `work/publication-extension.md` : justification de `contextMenus` pour le
  formulaire du Web Store, et notes de version 1.1.0.
- Journal `dev.md` tenu après chaque action.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `apps/extension/src/App.tsx` | `ALL` au lieu de `QUADS`, formulaire de création, géométrie |
| `apps/extension/src/store.ts` | `addBoard` |
| `apps/extension/src/background.ts` | Menus contextuels, client Supabase, badge |
| `apps/extension/src/styles.css` | Géométrie des carrés, 5ᵉ élément, formulaire |
| `apps/extension/public/manifest.json` | `contextMenus`, version 1.1.0 |
| `work/publication-extension.md` | Justification et notes de version |
| *(Claude Design)* `components/quadrant-picker.html` | Maquette, projet « Organic » |

Aucune migration SQL, aucun changement côté web.

---

## Vérifications

### Automatiques

```bash
npm run typecheck && npm run build      # seules commandes qualité du dépôt
```

### Plan de test manuel

L'extension se charge en non empaquetée depuis `apps/extension/dist`.

1. Une tâche « À trier » créée sur le web est **visible** dans le popup
2. Filtrer sur « À trier » fonctionne ; la case a un fond lisible
3. Ajouter une tâche directement dans « À trier »
4. Créer une matrice depuis le popup, sur un compte fourni **et** sur un compte vide
5. Elle apparaît aussitôt, et se retrouve sur le web au rechargement
6. Entrée valide, Échap annule, nom vide refusé, limite de 120 caractères
7. Les cinq éléments se lisent comme une matrice unique ; l'état sélectionné est
   lisible sur les cinq
8. Clic droit sur une **sélection de texte** → la tâche atterrit dans « À trier »
   de la dernière matrice active
9. Idem sur un **lien** et sur une **page** sans sélection
10. Sous-menu « Autre matrice › » → la tâche va bien dans la matrice choisie
11. Badge de succès visible puis effacé
12. **Déconnecté** : le clic ne perd pas la tâche en silence, le badge le signale
13. Créer une matrice dans le popup → elle apparaît dans le menu contextuel

Les points 1 à 7 sont vérifiables par capture d'écran ; 8 à 13 demandent l'extension
chargée dans Chrome, donc une passe manuelle de ta part.

### Livraison

Branche `story-light/extension-vague-1` depuis `main`. PR assignée à `@me`,
fermant **#11, #29, #16 et #52**.
