---
story: "Extension : passer du popup au panneau latéral"
story_code: "side-panel"
created: 2026-09-02
completed: 2026-09-02
status: "Done"
---

# Synthèse

## Résumé

L'extension quitte la fenêtre surgissante pour `chrome.sidePanel`. Aucune
fonctionnalité ne change — mêmes écrans, mêmes gestes, mêmes données ; c'est
l'hôte qui bouge.

Le lot n'était pas au programme : il est né du cadrage de #95. Trois de ses
arbitrages de mise en page se sont révélés dictés par les 400 × 600 px du popup
et non par le besoin, et une contrainte plus lourde traversait déjà le code — le
popup se ferme au blur, ce pour quoi `Capture.tsx` réécrivait le brouillon entier
à chaque frappe. Livrer #95 d'abord aurait figé une géométrie à refaire.

## Changements réalisés

- **Manifeste** — permission `sidePanel`, clé `side_panel`,
  `minimum_chrome_version: "116"`, retrait de `action.default_popup`, version
  1.3.0.
- **Build** — `popup.html` → `sidepanel.html`, `popup.tsx` → `sidepanel.tsx`,
  entrée Vite renommée, classe racine `.popup` → `.panel`, composant `PopupApp` →
  `PanelApp`.
- **Mise en page fluide** — `400px × 600px` → `100%` / `100dvh` ; menu d'actions
  en `min(210px, 100%)` ; ellipse et `flex: none` sur les lignes qui pouvaient
  déborder à 240 px.
- **Ouverture** — `setPanelBehavior({ openPanelOnActionClick: true })` aux deux
  événements de réveil ; `sidePanel.open({ windowId })` avant tout `await` dans
  `demander()`.
- **`watchPending`** — abonnement à `chrome.storage.onChanged` pour les captures
  arrivant après le montage.
- **`Capture.tsx`** — retrait du report du brouillon à chaque frappe.
- **Dossier Store** — justification de permission, notes 1.3.0, avertissement sur
  les captures d'écran à refaire.

## Fichiers modifiés

`apps/extension/public/manifest.json` · `apps/extension/vite.config.ts` ·
`apps/extension/sidepanel.html` *(renommé)* ·
`apps/extension/src/sidepanel.tsx` *(renommé)* ·
`apps/extension/src/{App.tsx,Capture.tsx,background.ts,pending-capture.ts,styles.css,store.ts,storage.ts,supabase.ts,active-board.ts,toast.tsx}` ·
`work/publication-extension.md`

`packages/shared`, `apps/web` et les migrations sont intouchés.

## Tests et validation

- **Typecheck** : ✅ les trois workspaces
- **Tests automatiques** : ✅ 120 partagés + 26 web. Aucun n'a eu à changer — le
  lot ne touche à aucune logique.
- **Build** : ✅ web et extension ; manifeste produit conforme,
  `host_permissions` absent
- **Validation manuelle** : ⏳ **en attente**. Elle suppose de charger
  `apps/extension/dist` en extension non empaquetée dans Chrome ; la liste de
  contrôle est dans la PR #102.

## Notes

**Ce qu'il ne faut pas défaire.** Trois points sont des pièges silencieux — ils
ne produisent aucune erreur quand on les casse :

1. **`sidePanel.open()` avant tout `await`.** La fenêtre de geste utilisateur se
   referme au premier `await` : remettre l'ouverture après `setPending` la ferait
   échouer *systématiquement*, et le repli masquerait la panne en écrivant
   quand même la tâche. On ne verrait que la disparition du formulaire.
2. **`action.default_popup` retiré.** Tant qu'il est déclaré, il gagne sur
   `setPanelBehavior` et l'icône rouvre une fenêtre surgissante.
3. **`minimum_chrome_version: "116"`.** L'API date de 114, `open()` de 116.

**Un rejet en vol à ne pas réintroduire.** Garder la promesse d'`open()`
rejetable pendant les `await` suivants produit un rejet non traité, remonté par
MV3 en erreur de service worker. D'où le `.then(() => true, () => false)`
immédiat.

**Un correctif hors périmètre.** `--color-neutral-100` et `--color-neutral-700`
étaient utilisés par le formulaire de capture depuis #78 sans être définis dans
le `:root` de l'extension : le fond des champs retombait sur `transparent`.
Corrigé avec les valeurs du ramp web. Isolable en deux lignes.

**Pour la suite (#95).** Deux arbitrages posés sous la contrainte des 400 px sont
à réexaminer maintenant qu'elle a sauté : le sous-menu du menu `⋯` peut s'ouvrir
à droite, et les paires côte à côte comme sur le web redeviennent envisageables
sur un panneau élargi. Le commentaire de `moveToBoard` a été annoté en ce sens —
l'absence de confirmation y tient désormais à l'inertie, plus à une contrainte
de place.

**Dette relevée, non traitée.** La version 1.2.0 n'a aucune note dans
`work/publication-extension.md`. Signalé en tête du document plutôt que comblé au
jugé.
