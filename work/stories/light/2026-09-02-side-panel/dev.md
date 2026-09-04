---
story: "Extension : passer du popup au panneau latéral"
story_code: "side-panel"
created: 2026-09-02
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| T0 — Tenue des tickets : créer l'issue « panneau latéral », mettre #95 à jour | Terminé | 2026-09-02 |
| T1 — Manifeste : `sidePanel`, `side_panel`, `minimum_chrome_version`, retrait de `default_popup` | Terminé | 2026-09-02 |
| T2 — Build : entrée `sidepanel`, renommage des fichiers, classe racine `.panel` | Terminé | 2026-09-02 |
| T3 — Mise en page fluide : racine en `100dvh`, menu `⋯` fluide, tenue de 240 px à 600 px | Terminé | 2026-09-02 |
| T4 — `background.ts` : `setPanelBehavior` + `sidePanel.open()` avant tout `await` | Terminé | 2026-09-02 |
| T5 — Capture reçue panneau déjà ouvert : abonnement à `storage.session.onChanged` | Terminé | 2026-09-02 |
| T6 — `Capture.tsx` : alléger l'écriture continue du brouillon | Terminé | 2026-09-02 |
| T7 — `work/publication-extension.md` : justification de la permission | Terminé | 2026-09-02 |
| T8 — Qualité : `typecheck`, `test`, `build:ext`, contrôle du manifeste produit | Terminé | 2026-09-02 |

## Journal

### 2026-09-02 : T0 — Tenue des tickets

**Statut** : Terminé

**Actions réalisées** :
- Créé #101 « Extension : passer du popup au panneau latéral » (`enhancement`, `extension`, `size: S`), à partir du contexte de cadrage.
- Mis #95 à jour : bandeau de dépendance à #101 en tête, section « Associer / Dissocier » ajoutée (mode armé, clic simple sur la cible, rendu en bloc vertical soudé), point « Nouvel univers » barré et motivé, arbitrage clic/double-clic tranché (minuteur 220 ms), affichage des liens intégré au périmètre, critères d'acceptation réalignés.
- Commentaire de liaison posé sur #101.

**Fichiers modifiés** : aucun (GitHub uniquement).

**Notes** : l'ordre #101 → #95 vient d'un constat de cadrage — trois arbitrages
de #95 (sens d'ouverture du sous-menu, rendu des paires, rognage du menu en bas
de liste) étaient imposés par les 400 × 600 px du popup, pas par le besoin. Les
figer d'abord aurait garanti de les refaire.

`Nouvel univers` a été annulé par l'utilisateur en cours de cadrage : le bouton
n'aurait produit qu'un en-tête vide, aucune matrice ne pouvant être rangée dans
un univers depuis l'extension.

### 2026-09-02 : T1 & T2 — Manifeste et build

**Statut** : Terminé

**Actions réalisées** :
- `manifest.json` : permission `sidePanel`, clé `side_panel.default_path`, `minimum_chrome_version`, **retrait de `action.default_popup`**, version 1.2.0 → 1.3.0.
- `popup.html` → `sidepanel.html`, `src/popup.tsx` → `src/sidepanel.tsx` (via `git mv`, l'historique suit), entrée Vite renommée.
- Classe racine `.popup` → `.panel`, composant `PopupApp` → `PanelApp`.
- Reprise des ~20 mentions de « popup » dans les commentaires.

**Fichiers modifiés** : `apps/extension/public/manifest.json`, `apps/extension/vite.config.ts`, `apps/extension/sidepanel.html`, `apps/extension/src/{sidepanel.tsx,App.tsx,background.ts,store.ts,storage.ts,supabase.ts,active-board.ts,pending-capture.ts,toast.tsx,styles.css}`.

**Notes** : `minimum_chrome_version` est à **116**, pas 114. L'API `chrome.sidePanel`
date bien de 114, mais `sidePanel.open()` — dont dépend l'ouverture depuis le menu
contextuel — n'arrive qu'en 116. Déclarer 114 aurait laissé installer l'extension
sur des versions où la capture par clic droit retombe systématiquement sur le repli.

Trois commentaires *justifiaient* une décision par une contrainte que le panneau
supprime : ils ont été repris à la main plutôt que renommés en masse.
- `moveToBoard` : « un popup de 400 px ne peut pas empiler une boîte modale » ne
  tient plus. Le geste reste sans confirmation, mais par inertie et non par
  décision — noté comme tel, à trancher dans #95.
- Mot de passe oublié : le motif du blur a disparu, celui de l'aller-retour par
  e-mail tient toujours. Comportement inchangé, justification corrigée.
- `pending-capture.ts` : le bloc expliquant l'absence de `patchPending` reposait
  sur la course entre frappes, qui n'existe plus. Reformulé sans être supprimé —
  la mise en garde reste valable pour qui voudrait rouvrir la porte.

### 2026-09-02 : T3 — Mise en page fluide

**Statut** : Terminé

**Actions réalisées** :
- `.panel` : `400px × 600px` → `100%` / `100dvh`, avec `html, body { height: 100% }` sans quoi la colonne s'effondre.
- `.task-menu` : `210px` → `min(210px, 100%)`.
- Ellipse et `flex: none` là où une ligne pouvait déborder à 240 px : `.detail-board`, `.board__name`, `.quad-sub`, plus les éléments non compressibles qui les entourent (`.squares`, `.board__pills`, `.board__meta`, `.board__chev`, `.quad-count`, `.quad-label`, `.home-openapp`).

**Fichiers modifiés** : `apps/extension/src/styles.css`.

**Notes** : `100dvh` et non `100vh` — la seconde ignore les barres d'outils
rétractables et laisse le pied de page dépasser.

Le choix `min(210px, 100%)` plutôt qu'une valeur en `calc()` : la largeur voulue
reste 210 px, elle cesse simplement d'être un plancher. À 400 px rien ne change,
à 240 px le menu se borne à sa carte.

### 2026-09-02 : T4, T5 & T6 — Ouverture du panneau et cycle de capture

**Statut** : Terminé

**Actions réalisées** :
- `background.ts` : `setPanelBehavior({ openPanelOnActionClick: true })` sur `onInstalled` et `onStartup` ; `demander()` appelle `sidePanel.open({ windowId })` **avant tout `await`**.
- `pending-capture.ts` : nouvelle fonction `watchPending(cb)`, abonnement à `chrome.storage.onChanged` sur la zone `session`, avec le même contrôle de péremption qu'à la lecture.
- `App.tsx` : branchement de `watchPending`.
- `Capture.tsx` : retrait du report du brouillon à chaque frappe et de la fonction `retenir`.

**Fichiers modifiés** : `apps/extension/src/{background.ts,pending-capture.ts,App.tsx,Capture.tsx}`.

**Notes** : deux pièges rencontrés, tous deux dans `demander()`.

1. **L'ordre est contre-intuitif et non négociable.** `sidePanel.open()` exige un
   geste utilisateur, et la fenêtre de geste se referme au premier `await`. La
   dérouler après `setPending` ou après `getActiveBoard` la ferait échouer
   *systématiquement* — pas par intermittence, ce qui aurait été pire à
   diagnostiquer. D'où l'inversion : ouvrir, puis préparer.
2. **Le rejet en vol.** Garder la promesse d'`open()` rejetable pendant les deux
   `await` suivants produit un rejet non traité, que MV3 remonte en erreur de
   service worker. Elle est donc réduite à un booléen immédiatement, par
   `.then(() => true, () => false)`.

La contrepartie de l'inversion — le panneau peut se monter avant l'écriture de la
capture — est absorbée par `watchPending`, qui couvre du même coup le cas
entièrement nouveau d'une capture reçue **panneau déjà ouvert**. Impossible du
temps du popup, qui se fermait au premier clic dans la page.

L'abonnement vit dans `pending-capture.ts` et non dans le composant : la clé de
stockage appartient à ce module, la faire fuir ailleurs garantirait deux endroits
à corriger le jour où elle change.

**Vérifications** : `npm run typecheck` passe sur les trois workspaces.
`npm run build:ext` produit `sidepanel.html` / `sidepanel.js` et un manifeste
conforme — `version 1.3.0`, `['storage', 'contextMenus', 'sidePanel']`,
`side_panel` présent, `action` sans `default_popup`, **`host_permissions` absent**.

### 2026-09-02 : T7 — Dossier de publication

**Statut** : Terminé

**Actions réalisées** :
- Justification de la permission `sidePanel`, sur le modèle de celle de `contextMenus` en 1.1.0.
- Note « ni `contextMenus` ni `sidePanel` n'affichent d'avertissement à l'installation — la ligne à ne pas franchir est `host_permissions`, et elle seule ».
- Section « Version 1.3.0 — notes de publication ».
- Section « Captures d'écran » : avertissement à refaire, les actuelles montrant un popup en vignette flottante.
- Justification de `storage` : « ouverture du popup » → « du panneau » (c'est un texte à coller aujourd'hui, pas un récit).
- En-tête : version courante 1.3.0.

**Fichiers modifiés** : `work/publication-extension.md`.

**Notes** : trois points relevés en passant.

1. **La 1.2.0 n'a aucune note dans ce document.** Elle a été bumpée sans y
   passer. Signalé en tête plutôt que comblé au jugé : si elle n'a jamais été
   soumise, la 1.3.0 emporte ses changements ; sinon ses notes sont à
   reconstituer depuis git avant la prochaine soumission.
2. **Les mentions de « popup » dans les récits historiques (corrections 1.0.0,
   notes 1.1.0) sont laissées telles quelles.** Les réécrire falsifierait
   l'historique des arbitrages, qui est précisément ce que ce document conserve.
   Seuls les textes *à coller aujourd'hui* et les consignes *à appliquer demain*
   ont été repris.
3. **`action.default_popup` est noté comme à ne pas remettre.** Tant qu'il est
   déclaré, il gagne sur `setPanelBehavior` et le clic sur l'icône rouvrirait une
   fenêtre surgissante — panne silencieuse, sans erreur nulle part.

### 2026-09-02 : T8 — Qualité

**Statut** : Terminé

**Actions réalisées** :
- `npm run typecheck` — les trois workspaces passent.
- `npm run test` — 120 tests partagés + 26 tests web, tous verts. Aucun n'a eu à changer : le lot ne touche à aucune logique.
- `npm run build` — web et extension.
- Contrôle du manifeste produit : `1.3.0`, `['storage', 'contextMenus', 'sidePanel']`, `side_panel.default_path` présent, `action` sans `default_popup`, `minimum_chrome_version: 116`, **`host_permissions` absent**.

**Fichiers modifiés** : `apps/extension/src/styles.css` (voir ci-dessous).

**Notes** : **un défaut préexistant corrigé au passage, hors périmètre annoncé.**
`--color-neutral-100` et `--color-neutral-700` sont utilisés par le formulaire de
capture depuis #78 (`.cap__area`, `.cap__input`, `.cap__btn`) mais n'ont jamais
été définis dans le `:root` de l'extension — seulement dans celui du web. Une
variable non définie rend la déclaration invalide au calcul : le fond des champs
retombait sur `transparent`, la couleur du bouton sur l'héritée.

Corrigé ici parce que ce lot touche ce formulaire et le rend plus visible, et
parce que les valeurs se reprennent telles quelles du ramp web — rien
d'inventé. Deux lignes, isolables si l'on préfère garder la PR d'un seul tenant.
