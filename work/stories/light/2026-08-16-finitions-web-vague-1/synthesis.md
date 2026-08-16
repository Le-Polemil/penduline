---
story: "Finitions web Vague 1"
story_code: "finitions-web-vague-1"
issues: [14, 51]
pr: 57
created: 2026-08-16
completed: 2026-08-16
status: "Done"
---

# Synthèse

## Résumé

Les deux derniers tickets de la Vague 1 qui ne touchent pas l'extension. Ce qui
les réunit est négatif : ce sont les seuls livrables pendant que la PR #56 est en
revue au Chrome Web Store, y mêler #12, #13 ou #15 aurait forcé une seconde revue.

**#14** rend l'ordre des matrices modifiable, à la souris et au doigt.
**#51** transforme l'appairage d'une décoration fragile en un lien qui tient.

## Décisions et leur raison

**Ne rien écrire de neuf pour #14.** `positionBefore()` implémentait déjà
l'insertion à position fractionnaire et l'extension s'en servait. Seul son typage
`Task[]` bloquait, alors qu'elle ne lit que `id` et `position` ; une interface
`Positioned` l'élargit sans qu'aucun appelant bouge. Dupliquer aurait laissé deux
logiques d'ordre à maintenir en parallèle — la pire dette possible sur un
mécanisme aussi central.

**Deux gestes pour #14, parce qu'un seul ne couvre pas les deux usages.** Le
glisser-déposer HTML5 ne fonctionne pas au doigt. La feuille d'appui long existait
déjà, ajoutée pour la même raison ; « Monter » et « Descendre » s'y greffent.

**« Descendre » s'exprime par « avant le suivant ».** `positionBefore` ne connaît
que l'insertion *avant* un élément. Écrit tel quel dans le code plutôt que laissé
à déduire.

**L'appairage est un lien, pas une mise en page.** C'est la décision de fond de
#51, et l'invariant qui en découle — *une paire reste ensemble, toujours* — est ce
que les quatre points de déplacement violaient. Chaque exception qu'on se serait
autorisée aurait vidé le lien de son sens, ce qui était exactement l'état de
départ.

**Dissocier au moment où le lien perd son sens, pas plus tôt.** Archivage et
suppression dissocient la survivante ; annuler une complétation dans les 4 s
préserve donc la paire, puisque l'archivage n'a pas encore eu lieu.

## Ce que le travail a mis au jour

**L'épinglage cachait une dépendance.** Les tâches épinglées étaient rendues une
par une, sans passer par `buildRows()`. Une paire épinglée se serait affichée sur
deux lignes — cassée, juste après qu'on ait garanti l'inverse. Trouvé en écrivant
`togglePin`, confirmé par le test dans l'autre sens.

**`dropInsert` devait exclure les deux tâches, pas une.** Sans quoi la partenaire
aurait servi de repère au déplacement de sa propre paire.

**Le lien était indevinable autant que fragile.** Il se crée par un glisser-déposer
qu'aucune affordance n'annonce, et rien ne distinguait deux tâches appariées de
deux tâches partageant une ligne par hasard. Réparer la fragilité sans réparer
l'invisibilité aurait laissé une fonctionnalité que personne ne trouve.

## Fichiers modifiés

- `packages/shared/src/layout.ts` — `Positioned`, `partnerOf`, signatures élargies
- `apps/web/src/data/store.ts` — `reorderBoard`
- `apps/web/src/screens/Home.tsx` — glisser-déposer, actions tactiles, `BoardGap`
- `apps/web/src/screens/Matrix.tsx` — `movePair`, `unpair`, épinglées, « Dissocier »
- `apps/web/src/styles.css` — interstices, connecteur de paire
- `README.md` — l'appairage décrit comme un lien

Aucune migration SQL : `boards.position` et `tasks.pair_id` existaient déjà.

## Tests et validation

- **Typecheck** : ✅ trois workspaces
- **Build** : ✅ trois workspaces
- **Lint / tests automatiques** : ⚠️ le dépôt n'en a pas — voir #31
- **#14** : ✅ feuille tactile, « Monter » / « Descendre », désactivation aux
  extrémités, persistance après rechargement
- **#51** : ✅ rendu de la paire, déplacement groupé, épinglage groupé,
  dissociation des deux côtés, aucun `pair_id` orphelin
- **Gestes de glisser-déposer à la souris** : ⛔ non simulables de façon fiable,
  passe manuelle à faire

> ⚠️ Les tests ont écrit en **production** (le `.env` racine y pointe, cf.
> `work/coolify-deploy.md:39`). Ordre restauré pour #14 ; tâches de test créées
> sur une matrice vide puis supprimées définitivement pour #51. État vérifié après
> coup : 0 tâche de test, 0 appairage restant.

## Notes pour la suite

Les cas dégradés d'appairage — partenaire supprimée, `pair_id` orphelin, trois
tâches partageant un identifiant — sont couverts par du code défensif dans
`partnerOf()` et `buildRows()`, mais **par aucun test**. Ce sont d'excellents
premiers candidats pour #31 : de la logique pure, sans base ni DOM, dont les
défaillances sont silencieuses.

Restaurer depuis la corbeille ne restaure pas l'appairage. Cohérent avec le reste
— la corbeille ne rétablit jamais un contexte, seulement une tâche.

## Reste de la Vague 1

**#12** (renommer une tâche), **#13** (déplacer vers une autre matrice) et **#15**
(nid pendulaire) touchent tous l'extension. Ils attendent le merge de #56, sans
quoi ils forceraient une seconde revue Chrome Web Store.
