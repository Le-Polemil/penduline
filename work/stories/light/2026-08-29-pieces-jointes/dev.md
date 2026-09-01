---
slug: "pieces-jointes"
title: "Pièces jointes : capturer une tâche avec son lien (#78)"
issues: [78]
created: 2026-08-29
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration `task_attachments` : RLS, contrainte `http(s)`, index | Terminé | 2026-08-29 |
| 2. `packages/shared` : `Attachment`, `attachmentsOf`, `hostLabel`, `isSafeUrl` | Terminé | 2026-08-29 |
| 3. Store web : chargement paginé, `addAttachment`, `removeAttachment` | Terminé | 2026-08-29 |
| 4. Affichage web : les liens sur la carte, ajout et suppression | Terminé | 2026-08-29 |
| 5. Extension : capture en attente, formulaire, repli | Terminé | 2026-08-29 |
| 6. Vérifications automatiques | Terminé | 2026-08-29 |
| 7. Validation en navigateur | Terminé | 2026-08-29 |

## Journal

### 2026-08-29 : Migration `20260829180000_task_attachments.sql`

**Statut** : Terminé

**Actions réalisées** :
- `task_attachments` : `task_id` (`on delete cascade`), `user_id`, `url`, `label`
  nullable, `position` fractionnaire
- `check (url ~* '^https?://' and char_length(url) between 8 and 2048)`
- RLS propriétaire, sur le modèle de `universes`
- `replica identity full` + ajout à `supabase_realtime` (la leçon de #39)

**Notes** : le schéma d'URL est contraint **en base** et pas seulement à la
saisie. Un `javascript:` entré par l'API — un client tiers, un script, une
version future du front qui oublierait de valider — finirait cliquable dans
l'app web. Le front valide **aussi**, pour le message d'erreur ; la base valide
**pour de bon**.

⚠️ **À appliquer en production avant le front.**

### 2026-08-29 : `packages/shared`, store et affichage web

**Statut** : Terminé

**Actions réalisées** :
- Type `Attachment` ; `attachmentsOf`, `hostLabel`, `isSafeUrl`, `normalizeUrl`
- Store : chargement **paginé** (le piège des 1000 lignes de #40 vaut ici aussi),
  `addAttachment`, `removeAttachment`, et le temps réel branché sur la table
- `components/Attachments.tsx` + prop facultative `attachments` sur `TaskCard`
- Entrée « ↗ Attacher un lien » dans le menu `⋯`

**Notes** : une tâche **sans** lien n'affiche rien du tout — pas de pastille
vide, pas de bouton. C'est la seule façon de ne pas alourdir une matrice où
l'immense majorité des tâches n'aura jamais de lien ; l'ajout vit donc dans le
menu, là où on le cherche.

`normalizeUrl` ne devine **que** le schéma manquant : un schéma déjà présent
n'est jamais réécrit, sinon `javascript:` deviendrait `https://javascript:` et
passerait la validation au lieu d'être refusé. Un test le fixe.

### 2026-08-29 : Extension — le formulaire de capture

**Statut** : Terminé

**Actions réalisées** :
- `urlFrom()` : le lien visé, à défaut la page — c'était le manque de #52, où
  `linkUrl` ne servait que de titre de repli et disparaissait dès qu'il y avait
  une sélection, c'est-à-dire dans le cas le plus fréquent
- `pending-capture.ts` : dépôt/lecture dans `chrome.storage.session`
- `Capture.tsx` : titre, lien, matrice, tous préremplis et modifiables
- `captureTask()` : la tâche **puis** le lien ; l'échec du lien ne condamne pas
  la tâche
- Repli : si `chrome.action.openPopup()` échoue, on écrit directement — le
  comportement d'avant
- Manifeste : **aucune permission ajoutée**, version 1.1.0 → 1.2.0

**Notes** : `chrome.storage.session` et pas `local` — une URL visitée est une
information personnelle, elle n'a pas à traîner sur le disque ni à survivre à la
fermeture du navigateur. La règle de péremption (`isFreshCapture`, 5 min) vit
dans `packages/shared` : c'est une décision de produit, pas de la plomberie, et
elle est ainsi testable sans stub de `chrome`.

### 2026-08-29 : Validation

**Statut** : Terminé

`npm test` → **146** (120 `shared` + 26 `web`) ; `typecheck` et `build` verts.

**Web**, onglet contrôlé sur le Supabase local :

| # | Point | Résultat |
|---|---|---|
| 1 | Lien ajouté, visible, cliquable en nouvel onglet | ✅ `rel="noopener noreferrer"` |
| 2 | `javascript:` refusé | ✅ par le champ **et** par la base (`23514` via l'API) |
| 3 | Plusieurs liens, supprimés un à un | ✅ |
| 4 | Une tâche sans lien garde son apparence | ✅ aucun bloc `.att` rendu |
| 5 | Le vidage définitif emporte les liens | ✅ cascade vérifiée en SQL |
| — | RLS : écrire pour un autre utilisateur | ✅ refusé (`42501`) |
| — | Schéma manquant complété | ✅ `github.com/x` → `https://github.com/x` |

**Extension** : Chrome 151 refuse `--load-extension` en ligne de commande et ne
m'a pas laissé attacher le service worker (`Extensions.loadUnpacked` charge bien
l'extension, mais le worker ne se réveille pas et `popup.html` est bloqué en
navigation directe — `web_accessible_resources` ne le déclare pas, à raison).

Le formulaire a donc été validé **servi hors extension**, avec un bouchon
`chrome.storage` fidèle (`session` adossé à `sessionStorage` : survit à la
fermeture du popup, meurt avec le navigateur), et une **écriture réelle** dans
Supabase :

| # | Point | Résultat |
|---|---|---|
| 6 | Formulaire prérempli titre + lien + matrice annoncée | ✅ |
| 7 | Le brouillon survit à une fermeture accidentelle | ✅ après correction |
| 9 | Aucune permission ajoutée | ✅ `['storage', 'contextMenus']` |
| — | La capture écrit tâche **et** lien dans « À trier » | ✅ vérifié en base |

**Non vérifié par moi, et il faut le dire** : l'appel réel à
`chrome.action.openPopup()` et le chemin du menu contextuel (point 8). Le repli
est le code de #52, inchangé et déjà en production ; la bascule qui le déclenche
est un `try/catch` autour de l'appel. À confirmer sur une extension chargée à la
main.

**Deux défauts trouvés au navigateur** :

1. **La destination retombait sur la première matrice.** L'entrée de menu annonce
   « Ajouter à « X » », mais `demander()` transmettait `boardId: null` pour ce
   cas et le formulaire choisissait `boards[0]` — une destination que rien
   n'avait annoncée. `null` est désormais résolu dans le service worker, à la
   même source que le titre du menu.
2. **Le brouillon perdait un champ sur deux.** `patchPending` faisait
   lire-puis-écrire ; deux frappes rapprochées dans deux champs différents
   lisaient la même version et la seconde écrasait la première — le titre corrigé
   disparaissait dès qu'on touchait ensuite au lien. La fonction a été supprimée :
   le formulaire tient déjà le brouillon entier et l'écrit en entier.
