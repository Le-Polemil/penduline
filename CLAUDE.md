# Penduline — règles du projet

## La présentation se met à jour avec le produit

`docs/presentation.html` est le deck qui sert à présenter Penduline : la méthode,
le modèle, les features livrées vague par vague, et la roadmap. Il est **versionné
avec le code** pour une seule raison : un deck qui vit à côté du repo devient faux
en trois semaines, et on ne s'en aperçoit que devant l'audience.

**Quand le mettre à jour.** À la clôture d'une story qui change ce qu'un collègue
verrait à l'écran : une feature livrée, une feature retirée, un parti pris produit
revu. En même temps que le `chore: bump version`, pas dans un ticket « doc » plus tard.

**Ce qui ne le déclenche PAS** : un correctif, un refactoring, une migration
interne, un ajustement de style. Si la feature ne mérite pas une phrase devant
quelqu'un qui ne connaît pas le projet, elle ne mérite pas une diapositive.

### Les trois règles de rédaction

**1. Rien qui ne soit sourçable dans le dépôt.** Chaque affirmation du deck doit
pouvoir être retrouvée dans le `README`, `work/architecture.md`, une synthèse de
`work/stories/`, un titre d'issue ou un commentaire de code. Une justification qui
« sonne juste » mais qu'on ne peut pas montrer est une invention : elle saute.
C'est ainsi qu'une ligne affirmant que le produit s'interdisait l'IA a survécu
jusqu'à la relecture — alors que l'issue #23 (serveur MCP) dit le contraire.

**2. Une diapositive = une idée, en une phrase.** Pas de paragraphe de conclusion,
pas d'aphorisme, pas de commentaire sur le deck lui-même. Le « pourquoi » détaillé
se dit à l'oral ; la diapositive porte le fait.

**3. Pas de détail d'implémentation sans intérêt pour un spectateur.** Les noms de
colonnes, les pièges de fuseau horaire et les mécaniques internes restent dans
`work/stories/`.

### Où intervenir

- **La vague concernée** d'abord : ajouter la carte, ou corriger celle qui ment.
  Une vague tient en une ou deux diapositives — ne pas empiler une diapo par ticket.
- **La grille des intérêts** ensuite : toute feature livrée doit tomber dans un des
  cinq registres (Confort / Simplification / Motivation / Objectifs / Rétrospective).
  Si elle ne tombe dans aucun, c'est un signal à discuter, pas une case à inventer.
- **Les compteurs** (PR, tickets, migrations, tests) et le **tableau des vagues**,
  qui se démodent silencieusement.
- Une feature **retirée** ne disparaît pas : elle devient un avant / après, comme
  l'épinglage remplacé par le mode « aujourd'hui ».

### Style et mise en page

Les couleurs viennent de `packages/shared/src/quadrants.ts` et
`apps/web/src/styles.css`, les fontes sont Caprasimo + Figtree. Si une valeur
change là-bas, elle change ici.

⚠️ **Ne jamais mettre `min-height: 0` sur une grille enfant d'une `.slide`.** Une
diapositive est un conteneur flex : une grille compressible se tasse sous la
hauteur de son contenu et **les textes des cartes se chevauchent**. C'est `flex:
none`, et `fitAll()` met à l'échelle ce qui dépasse encore plutôt que de le rogner.

**Vérifier avant de committer** : ouvrir le fichier, passer toutes les diapositives
au clavier, et contrôler qu'aucune ne déborde.
