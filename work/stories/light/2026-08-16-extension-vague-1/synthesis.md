---
story: "Lot Vague 1 — extension"
story_code: "extension-vague-1"
issues: [11, 29, 16, 52]
pr: 56
created: 2026-08-16
completed: 2026-08-16
status: "Done"
---

# Synthèse

## Résumé

Quatre tickets extension livrés en une branche et une release Web Store. Deux
réparent des impossibilités — la case « À trier » invisible dans le popup, et
l'impossibilité d'y créer une matrice ; deux étendent le produit — la géométrie du
sélecteur de case, et la capture depuis la page consultée.

Le regroupement n'est pas une commodité : **chaque version d'extension repasse en
revue au Chrome Web Store**, et #52 modifie le manifeste. Les séparer coûtait
quatre examens pour trois jours de travail.

## Ce que les tickets ne disaient pas

**#11 citait trois lignes ; il y en avait cinq.** Les deux oubliées sont les plus
gênantes, parce qu'elles n'auraient cassé qu'*après* avoir rendu le parking
sélectionnable — la correction elle-même les aurait introduites. `addQuadObj`
retombait sur `QUADS[0]`, donc choisir « À trier » aurait envoyé la tâche dans
« Faire » ; et le libellé du bandeau de filtre aurait affiché un vide.

**Le service worker chargeait React à chaque réveil.** Invisible à la lecture du
code, découvert en inspectant le bundle : `background.ts` importait
`getActiveBoard` depuis `store.ts`, qui importe les hooks React. Le chunk partagé
faisait 225 Ko, React compris, rechargé à chaque relance d'un worker que MV3 tue
en permanence. Extrait dans `active-board.ts` : 217 Ko sans React, et `popup.js`
retombe de 371 à 156 Ko.

**#52 change la déclaration d'usage des données.** `work/publication-extension.md`
affirmait « ne PAS cocher contenu des sites web : l'extension ne lit aucune page ».
Capturer un texte sélectionné relève de cette catégorie au sens du formulaire
Google, même quand la lecture est déclenchée par l'utilisateur. La case doit être
cochée à partir de la 1.1.0 — sous-déclarer expose à un retrait du Store. C'est
typiquement le détail qui se perd entre l'écriture d'un ticket et la soumission
d'un paquet.

## Décisions et leur raison

**Le disque « À trier » repose petit et grandit.** La maquette a montré qu'un
compteur central ne peut pas être lisible à 16 px : une tuile porte un chiffre de
9 px, le disque devrait être plus large qu'une tuile pour l'égaler. Il affiche donc
un seul caractère au repos — un « + » au-delà de neuf — et passe à 100 % au survol,
au focus clavier et à la sélection, pendant que les compteurs des tuiles reculent.
C'est ce recul qui dégage la place, et il vient d'une idée de l'utilisateur.

**Un centre sélectionné reste grand**, sans quoi l'état sélectionné cacherait le
compte que l'utilisateur vient précisément de choisir de regarder.

**Le « + » est relevé de 0,046 em.** Il est centré sur l'axe mathématique de la
fonte, pas sur la hauteur des chiffres : mesuré dans Figtree Bold à 9 px, son encre
tombe 0,818 px sous le centre contre 0,404 px pour un chiffre. La correction est
l'écart exact, pour l'aligner sur eux plutôt que sur le centre géométrique — une
première tentative à 0,06 em le faisait passer au-dessus.

**Le retour de capture passe par le badge**, pas par `chrome.notifications` qui
coûterait une permission de plus. Il couvre aussi l'échec : une capture perdue en
silence serait pire que pas de capture.

**La liste des matrices vient du popup**, pas d'une requête du worker.
`chrome.contextMenus` exige des entrées enregistrées à l'avance, et faire
interroger Supabase par un worker éphémère aurait créé une seconde source de
vérité pour rien.

**Le pied de page ne reçoit que la géométrie.** Ses pastilles ne portent aucun
compteur : un agrandissement au survol promettrait une révélation qui n'existe pas.

## Ce qu'on a renoncé à faire

**Descendre le worker sous les 217 Ko.** Taper PostgREST au `fetch` le réduirait à
quelques kilo-octets, mais imposerait de réimplémenter le rafraîchissement du jeton
d'accès, qui peut avoir expiré entre deux réveils. De la correction échangée contre
du temps de démarrage.

**Corriger l'aplomb général des chiffres.** Tous les glyphes tombent ~0,4 px trop
bas, à cause de l'asymétrie de la fonte (ascendante 9, descendante 2) que
`line-height` ne compense pas. Uniforme sur les cinq zones, donc cohérent, et
préexistant — hors périmètre.

**Faire reculer les compteurs par l'opacité** comme le prévoyait la maquette : les
tuiles portent leur `opacity` en style inline pour la gestion du filtre, qui
l'emporte sur la feuille de style. Le recul se fait par la taille seule.

## Fichiers modifiés

- `apps/extension/src/App.tsx` — cœur du lot
- `apps/extension/src/background.ts` — réécrit
- `apps/extension/src/active-board.ts` *(nouveau)*
- `apps/extension/src/store.ts`, `apps/extension/src/styles.css`
- `apps/extension/public/manifest.json` — `contextMenus`, version 1.1.0
- `work/publication-extension.md`
- *(hors dépôt)* Claude Design « Organic » → `components/quadrant-picker.html`

Aucune migration SQL, aucun changement côté web.

## Tests et validation

- **Typecheck** : ✅ trois workspaces
- **Build** : ✅ trois workspaces
- **Lint / tests automatiques** : ⚠️ le dépôt n'en a pas — voir #31
- **Validation visuelle** : ✅ cinq états vérifiés sur le **CSS buildé** via un
  harnais reproduisant le balisage de l'en-tête, ce qui évite d'ouvrir une session
- **Centrage du « + »** : ✅ mesuré au `TextMetrics`, pas jugé à l'œil
- **Absence de React dans le worker** : ✅ vérifiée sur le bundle
- **Menu contextuel, badge, cas déconnecté** : ⛔ demandent l'extension chargée
  dans Chrome — passe manuelle à faire

## Avant de soumettre au Store

1. Charger `apps/extension/dist` en extension non empaquetée et dérouler les
   points 8 à 13 du plan de test
2. Zipper `dist` en `penduline-extension-v1.1.0.zip`
3. **Cocher « contenu des sites web »** dans le formulaire d'usage des données et
   coller la justification de `work/publication-extension.md`
4. Ajouter la justification de `contextMenus`
