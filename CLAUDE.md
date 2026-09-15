# Penduline — règles du projet

## La présentation se met à jour avec le produit

`docs/presentation.html` est le deck qui sert à présenter Penduline : origine,
matrice d'Eisenhower, features livrées vague par vague, et roadmap. Il est
**versionné avec le code** pour une seule raison : un deck qui vit à côté du repo
devient faux en trois semaines, et on ne s'en aperçoit que devant l'audience.

**Quand le mettre à jour.** À la clôture de toute story qui change ce qu'un
collègue verrait à l'écran : une feature livrée, une feature retirée, un parti
pris produit revu. Concrètement, en même temps que le `chore: bump version` —
pas dans un ticket « mettre à jour la doc » plus tard.

**Ce qui ne le déclenche PAS** : un correctif, un refactoring, une migration
interne, un ajustement de style. Le deck raconte le *produit*, pas l'historique
des commits. Dans le doute : si la feature ne mérite pas une phrase devant
quelqu'un qui ne connaît pas le projet, elle ne mérite pas une slide.

**Comment le mettre à jour.**

- La slide qui compte d'abord, c'est **la vague concernée** (les slides 11 à 26) :
  ajouter la carte, ou corriger celle qui ment. Ne pas empiler une slide par
  ticket — une vague tient en une ou deux slides, sinon elle raconte mal.
- Puis **la grille des intérêts** (slide 30) : toute feature livrée doit tomber
  dans un des cinq registres (Confort / Simplification / Motivation / Objectifs /
  Rétrospective). Si elle ne tombe dans aucun, c'est le signal à discuter — pas
  une case à inventer.
- Puis **les compteurs** (slide 10 : PR, tickets, migrations, tests) et **le
  tableau des vagues** (slide 11), qui se démodent silencieusement.
- Une feature **retirée** ne disparaît pas du deck : elle devient un « avant /
  après » (cf. l'épinglage, slide 26). Ce qu'on enlève se présente aussi bien que
  ce qu'on ajoute.

**Le style est celui de l'app, pas un thème générique.** Les couleurs viennent de
`packages/shared/src/quadrants.ts` et `apps/web/src/styles.css`, les fontes sont
Caprasimo + Figtree. Si une valeur change là-bas, elle change ici. Pas de
dégradé, pas de flou, pas d'emoji — la même discipline que le produit.

**Vérifier avant de committer** : ouvrir le fichier, passer les 35 diapositives au
clavier, et contrôler qu'aucune ne déborde (chaque slide fait exactement une
hauteur d'écran, rien ne scrolle à l'intérieur).
