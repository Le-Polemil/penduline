---
story: "Vue globale : toutes matrices ou par univers"
story_code: "vue-globale"
issues: [18]
pr: 63
created: 2026-08-16
completed: 2026-08-17
status: "Done"
---

# Synthèse

## Résumé

Toutes les tâches dans une seule grille d'Eisenhower — toutes les matrices, ou
celles d'un univers. L'écran qui lit les univers livrés en #17.

Sous-branche empilée : PR #63 sur `story-light/univers` (#62), pas sur `main`.

## Décisions et leur raison

**Le regroupement par matrice n'est pas une préférence de mise en page, c'est la
seule agrégation honnête.** `tasks.position` est scopé à `(board_id, quadrant)` :
deux tâches de matrices différentes peuvent porter la même position. Inventer un
ordre global aurait été un mensonge d'interface.

**Deux gestes retirés, et retirés *visiblement*.** Réordonner et appairer par
dépôt présupposent un ordre. Plutôt que de les laisser produire un résultat
arbitraire, ils ne s'affichent pas : aucun interstice n'apparaît pendant un
glisser. Reste le seul geste qui n'en dépend pas — déposer sur une autre case,
la tâche se posant en fin de liste **dans sa propre matrice**.

**L'ajout de tâche est désactivé en v1.** Créer ici imposerait de désigner une
matrice : exactement la friction que l'écran supprime.

**Les trois dosages de cadre sont implémentés, `cadre` est actif.** Demande
explicite : pouvoir changer d'avis, ou en faire un réglage. Ils vivent comme
trois modificateurs CSS sur la grille ; `FRAME` (`screens/Global.tsx`) désigne
celui en vigueur. Un réglage n'aurait qu'à lire cette valeur ailleurs.

**Le nom de matrice porte l'information, jamais le trait seul** — d'où `--q-dark`
et non un `--q-ink` dilué. « À trier » est le cas limite : fond transparent sur le
beige de page, gris chaud le moins saturé des cinq.

**« Vers une autre matrice » propose toutes les matrices du compte**, pas
seulement celles de la portée : l'action concerne la tâche, pas la vue. Déplacer
hors portée la fait sortir de l'écran, et c'est la conséquence juste.

**La refacto d'abord, en commit séparé.** Carte, corbeille et cycle
cocher/annuler/archiver sortis de `Matrix.tsx` (769 → 511 lignes) au lieu d'être
recopiés — la leçon de #60. `TaskCard` porte la différence entre les deux écrans
en props **facultatives** (`drag`, `split`) : absentes, le geste n'existe pas.
Pas de drapeau `mode`, donc pas de conditionnelle à maintenir dans le composant.

## Ce que le travail a mis au jour

**🐛 `.bgroup:first-of-type` ne matchait rien.** `.quad-head` est un `div` lui
aussi : c'est *lui* le premier de son type dans la case. La règle était valide et
morte. Corrigée en `.quad-head + .bgroup`.

Trouvée **par l'œil**, en retour de validation — pas par le typecheck, qui ne voit
rien d'un sélecteur qui ne s'applique jamais, ni par la relecture, qui voit une
règle correcte. Le premier réglage que je croyais avoir posé n'avait produit aucun
effet : ce que montrait le navigateur venait entièrement d'un autre changement.

**Deux finitions ne sont sorties que de l'essai en navigateur** : la pastille du
premier cadre touchait le libellé de case, et le `margin-top` des épinglées
décentrait le haut du cadre. Neutralisées **dans le contexte du groupe seulement**.

**L'invariant d'appairage tient sans une ligne de code.** `buildRows` tournant
matrice par matrice, une paire — toujours intra-matrice — retombe dans un seul
cadre. Vérifié aussi pour le cas incohérent : un `pair_id` à cheval sur deux
matrices dégrade en deux cartes simples.

## Fichiers modifiés

- `packages/shared/src/layout.ts`, `layout.test.ts`
- `apps/web/src/components/TaskCard.tsx`, `BinModal.tsx` *(nouveaux)*
- `apps/web/src/data/useCompletion.ts` *(nouveau)*
- `apps/web/src/screens/Global.tsx` *(nouveau)*
- `apps/web/src/App.tsx`, `screens/Home.tsx`, `screens/Matrix.tsx`, `styles.css`

Aucune migration : la vue lit des données existantes.

## Tests et validation

- **Tests automatiques** : ✅ 52 (42 → 52)
- **Typecheck / build** : ✅ trois workspaces · **CI** : ✅
- **Parcours navigateur** sur base locale, console sans erreur : les deux portées,
  l'ordre des matrices conforme à l'accueil, le menu `⋯` complet, le déplacement
  de case, cocher → toast → archivage → corbeille → restauration, la paire sur
  une ligne, « Dissocier », l'univers vide, l'absence totale d'univers
- **Zéro `.row-gap` pendant un glisser** — vérifié en comptant les nœuds
- `role="group"` + `aria-label` sur chaque cadre, **aucun arrêt de tabulation**
  ajouté par l'étiquette
- **Écran matrice inchangé** : interstices, champ d'ajout et poignées intacts
- **Glisser à la souris** : ⛔ exercé par événements synthétiques — le chemin de
  code est couvert, le ressenti non
- **Garde-fou « univers disparu »** : ⛔ non reproductible en un seul onglet
  (il faudrait que le store se rafraîchisse pendant que la vue est ouverte)

## Avant de déployer

1. **#62 doit être mergée d'abord** — cette PR est empilée dessus.
2. La **migration `20260816120000_universes.sql`** doit atteindre la production
   **avant** le front (procédure dans `apps/supabase/README.md`).
3. **#18 ne se fermera pas tout seul** : GitHub ne déclenche la fermeture que sur
   la branche par défaut. À fermer à la main, ou quand la pile atteindra `main`.

## Note d'environnement

Ports Supabase locaux à nouveau décalés (55321-55324) pour cohabiter avec la
stack `unaya`, puis `config.toml` rétabli — vérifié identique à `HEAD`.

## Et après

**#23** (serveur MCP) reste débloqué par #17. Et la Vague 0 (#34 remontée des
erreurs, #35 supervision) ainsi que la Mise en conformité (#36, #38) restent les
vrais préalables à une ouverture publique — trois PR de fonctionnalités
attendent désormais devant elles.
