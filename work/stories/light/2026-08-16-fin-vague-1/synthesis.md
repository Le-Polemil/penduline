---
story: "Fin de la Vague 1"
story_code: "fin-vague-1"
issues: [12, 13, 15]
pr: 58
created: 2026-08-16
completed: 2026-08-16
status: "Done"
---

# Synthèse

## Résumé

Les trois derniers tickets de la Vague 1 : renommer une tâche, la déplacer vers une
autre matrice, et remplacer l'écran blanc du démarrage par le nid pendulaire. La
1.1.0 n'étant pas encore soumise, ils s'intègrent à cette version — **une seule
soumission couvre les sept tickets de la vague**, et le manifeste n'a pas bougé.

## Décisions et leur raison

**La spec de #13 était caduque, et il fallait le dire.** Elle prévoyait de casser
l'appairage en changeant de matrice — ce qui était juste quand l'appairage n'était
qu'une mise en page, mais #51 en avait fait un lien deux jours plus tôt. Appliquer
le ticket à la lettre aurait créé la seule exception à un invariant tout juste
posé, c'est-à-dire réintroduit exactement le défaut qu'on venait de supprimer.

**La confirmation est conditionnelle.** Deux tâches qui partent quand on en a
désigné une seule mérite d'être annoncé ; confirmer *chaque* déplacement lasserait
en une journée. Elle n'apparaît donc que si la tâche est appairée.

**L'animation n'est pas dans `icon.svg`.** Le plan le prévoyait ; ce fichier sert
de favicon, et une SVG animée chargée comme favicon s'anime dans certains
navigateurs — un logo d'onglet qui oscille en permanence, que personne n'a demandé.

**Et c'est ce qui a permis de tenir la demande.** Elle disait « la queue se plie
d'un côté ou de l'autre ». Faire pivoter l'image en bloc — ce qu'aurait donné un
`<img>` animé — ne plie rien : c'est un pendule rigide. En inlinant le tracé, le
col et le nid deviennent deux groupes qu'on fait osciller à 4,5° et 9° avec un
décalage de phase de 0,11 s ; **c'est cet écart qui produit le pli**, et il ne
s'obtient pas autrement sans déformer le tracé.

Contrepartie assumée : le tracé existe en deux copies (un `Loader` par
application), chacune renvoyant à `icon.svg` comme source du dessin.

**Le `⋯` de l'extension n'apparaît qu'au survol.** La carte fait 376 px et porte
déjà case, titre et épingle ; un bouton permanent rognerait le titre, seul contenu
utile au repos. `:focus-within` le garde atteignable au clavier.

**Pas de confirmation dans le popup**, contrairement au web : 400 px ne peuvent pas
empiler une modale sans se recouvrir. La partenaire suit tout de même — l'invariant
prime, et le rangement en connaissance de cause se fait sur le web.

## Ce que le travail a mis au jour

**L'extension cassait encore les appairages en silence.** #51 n'avait corrigé que
le web ; le popup remettait `pair_id` à `null` à l'épinglage **et** au
glisser-déposer, détruisant des liens créés ailleurs. Le même bug, depuis l'autre
application. Le popup n'affiche pas les paires côte à côte — mais ne pas les
afficher n'autorise pas à les détruire.

**La carte de tâche de l'extension n'avait aucun menu.** Porter #12 et #13 dans le
popup supposait donc de créer l'affordance, pas de déplacer un composant : c'était
le vrai coût du lot, invisible dans la rédaction des tickets.

**`packages/shared/icon.svg` était un doublon au bit près**, référencé par rien.
Supprimé avant de toucher à l'icône.

**Un piège CSS qui aurait cassé l'animation en silence** : sans
`transform-box: view-box`, `transform-origin` se résout sur la boîte englobante de
*chaque* groupe. Le col et le nid auraient tourné chacun autour de son propre
centre au lieu de pendre du même point.

## Fichiers modifiés

- `apps/web/src/screens/Matrix.tsx` — renommage, matrices cibles, confirmation
- `apps/web/src/components/Loader.tsx`, `apps/extension/src/Loader.tsx` *(nouveaux)*
- `apps/web/src/components/Confirm.tsx` — prop `tone`
- `apps/extension/src/App.tsx` — menu `⋯`, `movePair`, renommage, déplacement
- `apps/web/src/App.tsx` — loader aux deux points `null`
- `packages/shared/src/types.ts` — `board_id` dans `TaskPatch`
- `packages/shared/icon.svg` — **supprimé**
- `apps/web/src/styles.css`, `apps/extension/src/styles.css`
- `work/publication-extension.md` — notes 1.1.0 pour les sept changements

Aucune migration SQL. **Manifeste inchangé** : `1.1.0`, `["storage", "contextMenus"]`.

## Tests et validation

- **Typecheck** : ✅ trois workspaces
- **Build** : ✅ trois workspaces
- **Lint / tests automatiques** : ⚠️ le dépôt n'en a pas — voir #31
- **Balancier** : ✅ trois instants du cycle figés avec le CSS réel — incliné à
  gauche (col et nid désalignés), vertical, incliné à droite ; le pli est visible
  aux deux extrêmes
- **`pair_id: null` dans l'extension** : ✅ aucun restant
- **Manifeste** : ✅ inchangé
- **Popup chargé dans Chrome** : ⛔ menu `⋯`, renommage, déplacement, écran de
  chargement — passe manuelle à faire

## Avant de soumettre au Store

1. Dérouler le plan de test avec l'extension chargée en non empaquetée
2. Zipper `apps/extension/dist` en `penduline-extension-v1.1.0.zip`
3. `work/publication-extension.md` liste les sept changements, la justification de
   `contextMenus` et la déclaration « contenu des sites web »

## Et après

La **Vague 1 est complète** — sept tickets. Restent en attente : la Vague 0
(#33 fait, #34 et #35 à faire), la Mise en conformité (#36, #38 ; #37 fait), puis
les Vagues 2 à 5.

Le dépôt n'a toujours **aucun test** (#31), et cette story ajoute encore de la
logique invisible à l'œil : la préservation des paires existe maintenant en deux
exemplaires, web et extension, sans rien pour vérifier qu'ils restent d'accord.
