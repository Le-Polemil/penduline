---
story: "Extension : passer du popup au panneau latéral"
story_code: "side-panel"
created: 2026-09-02
status: "Done"
---

# Extension : passer du popup au panneau latéral

## Contexte

En cadrant #95 (replier le menu `⋯`, rendre la carte lisible), trois arbitrages
se sont révélés dictés non par le besoin mais par les **400 × 600 px en dur** du
popup d'action :

- le sous-menu doit s'ouvrir **à gauche** en 156 px, seule direction où il tient ;
- une paire ne peut pas s'afficher côte à côte comme sur le web — il resterait
  ~120 px de titre par carte ;
- le menu est rogné en bas de liste par le conteneur défilant, d'où un
  `scrollIntoView` de contournement.

Et une contrainte plus lourde traverse déjà le code : **le popup se ferme dès
qu'il perd le focus**. `Capture.tsx` réécrit pour cette seule raison le
brouillon entier dans `chrome.storage.session` *à chaque frappe* — son propre
commentaire le dit : « cliquer dans la page pour relire un titre suffit à le
faire disparaître ». `background.ts` documente sur quinze lignes la fragilité de
`chrome.action.openPopup()` (Chrome 127+, échoue quand aucune fenêtre n'a le
focus) et garde une écriture en aveugle comme repli.

`chrome.sidePanel` lève les quatre d'un coup : le panneau ne se ferme pas au
blur, occupe toute la hauteur de la fenêtre, est redimensionnable par
l'utilisateur, et s'ouvre depuis un clic de menu contextuel sans le contorsion-
nement actuel. Il reste ouvert en changeant d'onglet — la matrice devient
consultable *pendant* qu'on travaille, ce qu'un popup n'a jamais permis.

**Ce ticket ne change aucune fonctionnalité.** Il déplace l'hôte, rend la mise
en page fluide, et fiabilise l'ouverture depuis le menu contextuel. #95 se pose
ensuite dessus, avec la géométrie tranchée une seule fois.

### Coût assumé

| Point | Décision |
|---|---|
| Permission `sidePanel` | Acceptée. La ligne rouge de `work/publication-extension.md` est `host_permissions` (examen approfondi) — pas ça : comme `contextMenus` en 1.1.0, `sidePanel` n'affiche **aucun avertissement à l'installation** |
| Chrome 114+ | Déclaré par `minimum_chrome_version`. L'extension est déjà Chrome-only (`chrome.*`, MV3) |
| Perte de l'ouvrir/fermer d'un geste | Assumée. Maintenir les deux hôtes doublerait la surface pour un seul produit |

---

## Tâches

### T0 — Tenue des tickets

- **Créer l'issue « Passer l'extension en panneau latéral »** (labels
  `enhancement`, `extension`, `size: S`), avec le contexte ci-dessus.
- **Mettre #95 à jour** : marquer la dépendance à ce nouveau ticket, retirer le
  point « Nouvel univers » (annulé en cadrage), ajouter « Associer / Dissocier »
  au menu cible, et remplacer les arbitrages de géométrie — désormais à
  retrancher une fois le panneau en place.

### T1 — Manifeste

`apps/extension/public/manifest.json` :

```jsonc
"minimum_chrome_version": "114",
"permissions": ["storage", "contextMenus", "sidePanel"],
"side_panel": { "default_path": "sidepanel.html" },
"action": { /* default_popup RETIRÉ, titre et icônes conservés */ }
```

`default_popup` retiré : c'est ce qui rend `chrome.action.onClicked` disponible,
et donc `setPanelBehavior({ openPanelOnActionClick: true })` — le clic sur
l'icône ouvre le panneau sans aucun écouteur à maintenir.

Bump de la version du manifeste (1.2.0 → 1.3.0) : le changement de permissions
en fait une publication à part entière.

### T2 — Build

`apps/extension/vite.config.ts` : entrée `popup` → `sidepanel`.
`popup.html` → `sidepanel.html`, `src/popup.tsx` → `src/sidepanel.tsx`.
La classe racine `.popup` devient `.panel` (`App.tsx` + `styles.css`) — un seul
nom à reprendre, et le laisser mentirait sur ce qu'est désormais l'hôte.

### T3 — Mise en page fluide

`apps/extension/src/styles.css`. La seule dimension figée est la racine :

```css
html, body { height: 100%; }
.panel { width: 100%; height: 100dvh; }   /* était 400px × 600px */
```

Puis vérifier ce qui supposait 400 px :
- `.task-menu` (210 px fixes) → `width: min(240px, calc(100% - 24px))`, toujours
  ancré à droite ;
- `.toast` en `position: fixed` — le panneau est le viewport, rien à changer ;
- les grilles de pastilles (`.squares`, `.add-squares`) sont en `grid` sur des
  tailles absolues : elles tiennent telles quelles.

Cible de test : **240 px** (largeur minimale imposée par Chrome) et **600 px**
(panneau élargi). Rien ne doit déborder horizontalement à 240.

### T4 — `background.ts` : ouvrir le panneau

- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` sur
  `onInstalled` **et** `onStartup`, comme `buildMenus`.
- `demander()` appelle `chrome.sidePanel.open({ windowId })` **avant tout
  `await`**. C'est le point délicat : `open()` exige un geste utilisateur, et un
  `await` intercalé rompt la chaîne. L'ordre actuel — déposer la capture, puis
  ouvrir — doit donc s'inverser.
- Le repli reste **inchangé dans son principe** : si `open()` échoue, on écrit
  directement. C'est le point non négociable de #78 — une capture perdue en
  silence est pire que l'absence de formulaire.

### T5 — Recevoir une capture panneau déjà ouvert

Conséquence directe de T4, et **nouveau cas** : le panneau ne se fermant plus,
une capture peut arriver alors qu'il est monté. `getPending()` au montage ne
suffit plus, et l'inversion d'ordre de T4 crée la même course à l'ouverture.

`App.tsx` s'abonne à `chrome.storage.session.onChanged` sur la clé de
`pending-capture.ts` : une capture déposée après le montage ouvre le formulaire.
Un seul mécanisme couvre les deux situations.

### T6 — `Capture.tsx` : alléger l'écriture continue

L'écriture du brouillon à chaque frappe n'a plus de raison d'être — c'était la
parade au blur. On la conserve néanmoins **au montage et à la validation**, pour
qu'un rechargement de l'extension ne perde pas une saisie en cours, mais on
retire le `retenir()` de chaque `onChange`.

⚠️ Ne pas supprimer `pending-capture.ts` : c'est toujours le canal entre le
service worker et le panneau.

### T7 — `work/publication-extension.md`

Ajouter la justification de la permission, sur le modèle de celle de
`contextMenus` en 1.1.0, et noter la version. Ce document est la mémoire du
dossier Store — le laisser périmé coûterait un aller-retour de revue.

> **Justification de la permission `sidePanel`** — L'extension affiche son
> interface dans le panneau latéral du navigateur plutôt que dans une fenêtre
> surgissante, afin que l'utilisateur puisse consulter ses tâches tout en
> naviguant. Cette permission sert uniquement à afficher ce panneau ; elle
> n'accorde aucun accès au contenu des pages.

Rappeler aussi que `host_permissions` reste absent et que la revue reste
standard.

### T8 — Qualité

`npm run typecheck` · `npm run test` · `npm run build:ext`
(pas de script de lint dans ce dépôt — `typecheck` fait office de garde.)

---

## Fichiers touchés

**Renommés** — `apps/extension/popup.html` → `sidepanel.html`,
`apps/extension/src/popup.tsx` → `sidepanel.tsx`

**Modifiés** — `apps/extension/public/manifest.json`,
`apps/extension/vite.config.ts`,
`apps/extension/src/{App.tsx,styles.css,background.ts,Capture.tsx}`,
`work/publication-extension.md`

**Intouchés** — `packages/shared`, `apps/web`, les migrations, `store.ts`.
Aucune fonctionnalité ne change : c'est un déplacement d'hôte.

---

## Vérification

**Automatique** — `npm run typecheck && npm run test && npm run build:ext`.
Puis contrôler le manifeste produit, comme le fait déjà le doc de publication :

```
python3 -c "import json;m=json.load(open('apps/extension/dist/manifest.json'));\
print(m['version'], m['permissions'], m.get('side_panel'), m.get('host_permissions'))"
```
→ `host_permissions` doit être absent.

**Manuelle** — charger `apps/extension/dist` (`chrome://extensions`, mode
développeur) :

1. **Ouverture** — clic sur l'icône : le panneau s'ouvre à droite. Il reste
   ouvert en changeant d'onglet et en naviguant.
2. **Blur** — cliquer dans la page pendant qu'un renommage est ouvert : le
   panneau **reste**, la saisie aussi. C'est le gain central.
3. **Largeur minimale** — réduire le panneau au plus étroit (240 px) : aucun
   débordement horizontal, le menu `⋯` reste dans le cadre.
4. **Largeur confortable** — élargir à ~600 px : la mise en page suit, rien
   n'est centré de travers ni étiré.
5. **Hauteur** — la liste occupe toute la hauteur de la fenêtre ; l'en-tête et
   le pied restent en place au défilement.
6. **Capture, panneau fermé** — clic droit sur une sélection › « Ajouter à
   « X » » : le panneau s'ouvre **sur le formulaire**, prérempli.
7. **Capture, panneau déjà ouvert** — même geste : le formulaire remplace la
   grille sans rechargement (c'est T5).
8. **Repli de capture** — cas dégradé à provoquer en neutralisant temporairement
   `sidePanel.open()` : la tâche doit être écrite directement, badge `✓`. Aucune
   capture perdue.
9. **Reprise** — fermer le panneau, le rouvrir dans les deux heures : la
   dernière matrice consultée est bien celle qui s'affiche.
