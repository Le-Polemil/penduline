---
story: "Univers : regrouper les matrices"
story_code: "univers"
issues: [17]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Le modèle du produit est plat, et c'est revendiqué : `boards → tasks`, sans niveau
intermédiaire. Ce choix tient tant qu'on a quelques matrices. Passé une dizaine,
l'accueil devient une liste où plus rien ne se distingue — et le produit encourage
précisément la multiplication des matrices, puisqu'il invite à en créer une par
contexte.

Les univers ajoutent un niveau **sans imposer de découpage**. On peut en créer
autant qu'on veut, ou aucun : les matrices non rangées restent parfaitement
utilisables, dans un groupe de fin. C'est la même position que celle du produit
sur les matrices elles-mêmes — le découpage appartient à l'utilisateur, l'app n'en
propose aucun par défaut.

Concrètement : créer, renommer, réordonner et supprimer des univers ; y ranger des
matrices en les glissant d'un groupe à l'autre ; et retrouver ces groupes dans
l'extension. Supprimer un univers ne supprime jamais ses matrices — elles
repassent simplement sans univers.

Le critère d'acceptation le moins évident, et le plus important : **un compte sans
aucun univers doit rester exactement aussi utilisable qu'avant**. La migration
n'en crée aucun, donc c'est l'état de tous les comptes existants au lendemain du
déploiement. Si l'accueil se lit mal dans cet état, la fonctionnalité est ratée
pour tous ceux qui ne s'en servent pas.

## Vue architecturale

Première migration depuis le schéma initial, et premier niveau ajouté au modèle.

```
  AVANT                        APRÈS
  ─────                        ─────
  boards ──▶ tasks             universes ──▶ boards ──▶ tasks
                                   (nullable)
```

**`universe_id` est nullable, et sa suppression est `set null`, pas `cascade`.**
Les deux décisions disent la même chose : le regroupement est une **vue** sur les
matrices, pas leur propriétaire. Supprimer un univers ne doit jamais emporter ce
qu'il contenait — sans quoi ranger deviendrait un acte risqué.

**La position d'une matrice devient scopée à son univers**, exactement comme celle
d'une tâche l'est à `(board, quadrant)`. La logique existe déjà et n'a pas à être
réécrite : `positionBefore()` accepte n'importe quel `Positioned` depuis #14.

**Le regroupement vit dans `packages/shared`**, pas dans le composant. C'est ce qui
le rend testable — le harnais posé par #31 le couvrira — et ce qui garantit que le
web et l'extension groupent de la même façon. La leçon de #60 est fraîche : une
règle écrite deux fois finit par diverger.

```
  layout.ts
    groupByUniverse(universes, boards)
      → [{ universe, boards }, …, { universe: null, boards }]
                                       └─ toujours en dernier
```

Le groupe sans univers ferme la liste, par cohérence avec « À trier » qui ferme la
grille dans `ALL = [...QUADS, PARK]`. Le non-classé se lit en bas, pas en tête.

**Contrainte de déploiement** : la production est un Supabase auto-hébergé sur
Coolify. La migration doit y être appliquée **avant** le déploiement du front,
sinon `universe_id` n'existe pas et les lectures échouent.

## Impacts UX

Le geste central est un enrichissement de celui qui existe déjà. L'accueil sait
glisser-déposer des matrices pour les réordonner (#14) ; désormais **chaque
interstice appartient à un univers**, si bien que déposer une matrice dans un autre
groupe l'y affecte *et* la positionne.

```
   ┌─ Boulot ────────────────────┐
   │ ⠿ Sprint 42            3 1  │
   ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ ← déposer ici = ranger dans Boulot
   │ ⠿ Recrutement          2    │
   └─────────────────────────────┘
   ┌─ Maison ────────────────────┐
   ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ ← un groupe vide garde son interstice,
   └─────────────────────────────┘   sinon un univers neuf serait inatteignable
   ┌─ Sans univers ──────────────┐
   │ ⠿ Courses                   │
   └─────────────────────────────┘
```

Un seul geste pour deux intentions, sans ambiguïté puisque la cible est visible
pendant le déplacement. Le prix à payer est technique — les interstices doivent
être découpés par groupe — pas cognitif.

**Au doigt, ce geste n'existe pas** : le glisser-déposer HTML5 ne fonctionne pas au
tactile. La feuille d'appui long gagne donc « Déplacer vers un univers », à côté
des actions déjà présentes. Sans elle, ranger serait impossible sur mobile.

**Dans l'extension, le regroupement par univers remplace celui par « actives /
calmes »** — deux dimensions de regroupement dans 400 px seraient illisibles. Une
matrice sans rien à faire ne disparaît plus derrière un repli : elle reste à sa
place dans son univers, atténuée. Repliée, elle était introuvable ; atténuée, elle
est simplement au repos, et on la retrouve là où on l'a rangée.

Accessibilité : les actions d'en-tête de groupe reprennent le motif
`:focus-within` déjà utilisé pour les actions de matrice, sans quoi renommer un
univers deviendrait impossible sans souris.
