---
story: "Correctif Mobile 1/3 — la base"
story_code: "correctif-mobile-base"
created: 2026-09-15
---

# Contexte

## Description fonctionnelle

Penduline se conçoit et se relit au clavier sur grand écran : le mode mobile n'a jamais été audité. Résultat, une matrice consultée depuis un téléphone est aujourd'hui partiellement inutilisable — l'en-tête déborde et emporte le bouton corbeille hors de l'écran, le titre d'une tâche ne dispose que de 30 % de la largeur de sa carte (0 % dans une paire), la plupart des commandes sont trop petites pour être visées au doigt, et chaque mise au point dans un champ déclenche un zoom iOS dont l'utilisateur ne ressort pas seul. Ce lot rend l'application simplement **lisible et atteignable** au téléphone : on doit pouvoir lire ses tâches, appuyer sur ce qu'on vise, et ne jamais avoir à faire défiler l'écran latéralement pour retrouver une commande.

Le périmètre est celui des défauts **statiques**, visibles sans interagir : débordements horizontaux, contenus tronqués ou hors écran, cibles tactiles sous 44 × 44 px, taille des champs de saisie, marges de sécurité (encoche, barre gestuelle, paysage) et unités de viewport. C'est le premier de trois lots, volontairement séparés par cause : les états de survol collants partent en #90, les animations en #91, les anomalies constatées au passage mais communes au desktop en #92 (case à cocher sans contour sur « Aujourd'hui » et « Revue », bouton d'effacement natif de la recherche). Rien de fonctionnel n'est retiré ni ajouté : les écrans, les données et les parcours restent identiques.

Le seul changement d'interaction visible est la contrepartie d'une décision de cadrage : plutôt que de supprimer des fonctions pour rendre sa place au titre, **la carte devient balayable sous 720 px**. Un glissement vers la gauche découvre un bandeau de trois actions — étape, aujourd'hui, échéance — qui occupaient jusqu'ici plus de largeur que le contenu lui-même. En contrepartie la poignée de glisser-déposer disparaît sous ce seuil (le glisser HTML5 ne se déclenche pas au doigt sur téléphone) et reste présente au-dessus, sur iPad et desktop, où elle fonctionne. Les deux gestes ne coexistent donc jamais sur un même écran. « Ajouter une étape » rejoint par ailleurs le menu `⋯` pour qu'un chemin sans geste subsiste, notamment sur tablette avec clavier.

Critères d'acceptation :

- À 390 × 844 en tactile, sur les huit écrans (accueil, matrice, vue globale, aujourd'hui, revue, rétrospective, corbeille, recherche), `document.scrollWidth` vaut 390 : aucun défilement horizontal parasite.
- Sur la vue globale à 390 px, le bouton corbeille est visible et cliquable, quel que soit le nom de la matrice.
- Plus aucun élément interactif visible ne mesure moins de 44 × 44 px sous `(pointer: coarse)`, et aucun champ de saisie ne descend sous 16 px — y compris sur iPad.
- Le titre d'une tâche portant un badge d'échéance est lisible ; un balayage vers la gauche ouvre le bandeau d'actions, un balayage inverse ou un appui ailleurs le referme, une seule carte ouverte à la fois, et un balayage ne déplie pas le titre.
- Un geste vertical sur une carte fait défiler la page sans ouvrir le bandeau.
- Une paire de tâches s'empile verticalement, sa marque de lien tombant dans l'axe des cases à cocher.
- L'interface respecte les marges de sécurité : barre utilisateur sous l'encoche, notifications au-dessus de la barre gestuelle, marges latérales en paysage.
- Aucune régression à 1440 × 900 à la souris (poignée présente, raccourcis sur la carte, paires côte à côte, aucun bandeau monté) ni à 834 × 1112 sur iPad ; `prefers-reduced-motion` supprime l'animation de retour de carte.

## Vue architecturale

Le correctif repose sur **deux axes de requête média qui ne mesurent pas la même chose**, et c'est la décision structurante du lot. La largeur (`max-width: 720px`) décide de la **géométrie et des gestes** : ce qui tient sur une ligne, ce qui s'empile, quel geste horizontal est monté. Le pointeur (`pointer: coarse` / `hover: none`) décide de l'**ergonomie** : taille des cibles, taille des polices de saisie. Le projet mélangeait les deux — `.task__act` passe à 44 px sous `(hover: none)` (styles.css:1502-1507), ce qui gonfle les raccourcis sur iPad comme sur iPhone alors que seul le second manque de place. Séparer les axes permet à l'iPad (768-1024 px, `hover: none`) de garder la carte desktop avec de grosses cibles, et à l'iPhone de basculer sur le balayage. La frontière est exclusive par construction :

```
                    ≤ 720 px                  > 720 px
                    (téléphone)               (iPad, desktop)
  poignée ⠿         masquée                   visible
  draggable         désarmé                   armé
  glisser HTML5     ne se déclenche pas       seul geste horizontal
  useBalayage       monté                     non monté
  .task__act        déplacés dans le bandeau  sur la carte
```

Les deux API qui se disputeraient l'axe horizontal ne sont donc **jamais montées ensemble** : ce n'est pas un arbitrage à l'exécution mais une exclusion à la construction, ce qui évite d'avoir à départager un `dragstart` et un `pointermove` dans le même gestionnaire. Trois gardes complètent l'isolation côté téléphone : `touch-action: pan-y` rend l'axe vertical au navigateur sans annulation d'événement passif, un seuil de 10 px arme le geste, et le `click` est avalé si la carte a bougé.

Le nouveau `apps/web/src/data/useBalayage.ts` suit exactement le partage que `dnd/gap.ts` a établi pour le clavier et la souris : **la règle sort du gestionnaire d'événement pour devenir une fonction pure**, le hook ne gardant que le câblage Pointer Events et l'état de position. `gap.ts` isole `gapIndexAt` et `dropTarget` précisément pour les tester sans DOM ; `etatApres(dx, largeur) → 'ouvert' | 'ferme'` reprend la forme, avec son `useBalayage.test.ts` en regard de `gap.test.ts`. Le hook rejoint `data/` aux côtés de `useTitreDepliable` — même famille : un geste de carte, partagé par plusieurs écrans, dont le comportement est documenté plutôt que dispersé.

```
  pointerdown ──> mémorise origine, désarme au-delà du seuil
  pointermove ──> suit le doigt en translateX (propriété composée, pas de `left`)
  pointerup   ──> etatApres(dx, largeur)   [pur, testé]
                        │
                  'ouvert' | 'ferme'  ──> l'écran arbitre (une seule carte)
```

L'insertion DOM est le point le plus délicat, parce que **le conteneur clippant doit contenir la carte sans emporter le menu**. `.task-anchor` existe déjà pour une raison précise (styles.css:650-655) : il ancre `.task-menu` sur la carte, sans quoi un `top: 100%` calculé sur `.card-wrap` faisait tomber le menu sous les étapes. Le nouveau `.task-swipe` s'insère donc **à l'intérieur** de `.task-anchor` et **au-dessus de la seule `.task`** — le menu reste frère, hors du `overflow: hidden`, sinon il serait rogné dès son ouverture :

```
  .card-wrap
    └── .task-anchor            position: relative   (ancre du menu — inchangée)
          ├── .task-swipe       position: relative; overflow: hidden   ← nouveau
          │     ├── .task-swipe__actions   absolute; right: 0; inset-block: 0
          │     └── .task                  transform: translateX(dx)
          └── .task-menu        inchangé, hors du clip
    ├── Attachments / Deadline / Subtasks   (inchangés, sous la carte)
```

Corollaire assumé : un parent clippant couperait le `box-shadow` de `.task`, donc **l'ombre migre sur `.task-swipe` sous 720 px** — deux porteurs d'ombre selon la largeur, à documenter là où c'est écrit. Deux points de contact existants passent par ce nouveau niveau. `useTitreDepliable` pose ses écouteurs natifs sur `.task` via `closest('.task')` : la résolution reste bonne, mais son garde-fou `glisse` n'est armé que par `dragstart`, absent d'un balayage Pointer Events — l'avalement du `click` doit donc se faire **en phase de capture depuis `.task-swipe`**, en amont de l'écouteur du hook de dépliage, sans quoi tout balayage déplierait un titre. Et `.task` porte `viewTransitionName: vt-{id}` (TaskCard.tsx:270) : une transition de vue pendant un balayage en cours peut figer la carte décalée, à vérifier explicitement.

L'état « une seule carte ouverte » n'entre **pas** dans `TaskCard` : il est tenu par l'écran, sur le modèle littéral de `menuOpen` / `onMenu` (`const [menuTask, setMenuTask] = useState<string | null>(null)`, puis `menuOpen={menuTask === t.id}` — Matrix.tsx:407-408, Global.tsx:234-235). C'est la doctrine constante du composant, qu'il applique déjà au renommage et à l'ajout de lien : ce qui doit être unique à l'échelle de l'écran vit chez l'écran. L'impact à mesurer est qu'il y a **quatre consommateurs**, pas deux : Matrix, Global, Focus (Focus.tsx:101-102) et Review (Review.tsx:197-198) tiennent chacun leur `menuTask` et devront tenir le `balayeTask` correspondant. Le bandeau suit la même règle des props facultatives que le reste de `TaskCard` — pas de drapeau `mode` : chacun de ses trois boutons n'existe que si la prop correspondante (`subtasks`, `focus`, `deadline`) est fournie, si bien que Focus et Review, qui n'en passent pas toutes, obtiennent un bandeau réduit sans conditionnelle supplémentaire. Fermé, le bandeau est `aria-hidden` et hors tabulation : il ne doit rien ajouter au parcours clavier, déjà dense d'un arrêt par contrôle et par tâche.

Sur le reste de l'architecture, l'empreinte est volontairement faible mais large. Le gros du lot (points 2, 3, 8, 9, 10) est **purement CSS**, sans changement de structure ni de composant, ce qui limite le risque de régression desktop aux sélecteurs employés. Deux ajouts se remarqueront néanmoins : le déplacement d'« Ajouter une étape » vers le menu `⋯` fait de ce menu le chemin sans geste garanti — la carte n'est plus le seul accès à cette action, ce qui est la condition pour pouvoir en retirer les raccourcis sous 720 px ; et le passage des marges de sécurité (`env(safe-area-inset-*)`, aujourd'hui présent une seule fois dans tout le projet malgré `viewport-fit=cover`) sur `.userbar`, `.toast-stack` et les cinq conteneurs d'écran installe une convention qui devra être suivie par tout nouvel écran. Enfin, la vérification se scinde nettement : la seule logique testable automatiquement est la fonction pure de `useBalayage` ; tout le reste — débordements, cibles, empilement des paires — relève du contrôle A/B en émulation, d'où l'importance de la matrice de vérification 390 / 834 / 1440 du plan, qui est le seul filet contre une régression desktop causée par une requête média trop large.

## Impacts UX

Le correctif touche l'objet le plus répété de l'application — la carte de tâche — et il y déplace le curseur entre *commander* et *lire*. Aujourd'hui, sous `(hover: none)`, les deux raccourcis de la carte s'étirent à 44 × 44 pour rester frappables, soit 88 px pris sur 306 : le titre tombe à 91 px, à 13 px dès qu'une échéance s'affiche, à zéro dans une paire. Autrement dit, sur téléphone, **deux commandes secondaires occupent plus de place que la seule chose qu'on vient lire**. Les sortir de la carte et les poser dans un bandeau révélé au balayage rend au titre ~176 px, soit deux fois mieux, échéance comprise — sans supprimer une seule fonction.

```
AVANT  (390 px, carte à échéance)
┌────────────────────────────────────────────────┐
│ ⠿ ◻ Rappe…  ⏰ demain   [⊞]   [☀]   [⋯]        │
│      └13px┘             └──── 88 px ────┘      │
└────────────────────────────────────────────────┘

APRÈS  (au repos)
┌────────────────────────────────────────────────┐
│ ◻  Rappeler le rendez-vous du m…  ⏰ dem.  ⋯   │
│    └───────────── ~176 px ─────────────┘       │
└────────────────────────────────────────────────┘
              ←── balayage
┌───────────────────────────────┬─────┬─────┬────┐
│ ◻  Rappeler le rendez-vous…   │  ⊞  │  ☀  │ ⏰ │
│                               │ 44  │ 44  │ 44 │
└───────────────────────────────┴─────┴─────┴────┘
                                  étape  auj.  éch.
```

Le point sensible est la **découvrabilité** : un balayage ne s'annonce pas, et une fonction qui ne tient qu'à un geste inconnu est une fonction perdue. La réponse tenue ici est de ne jamais faire du geste le seul chemin — le menu `⋯` reste visible en permanence et conserve tout ce que le bandeau propose, « Ajouter une étape » venant précisément l'y rejoindre à côté d'« Attacher un lien », alors qu'elle ne vivait jusqu'ici que sur la carte au survol. Le balayage devient donc un raccourci pour qui l'apprend, jamais un péage pour qui l'ignore ; c'est aussi ce qui satisfait WCAG 2.5.1 (toute action obtenue par un geste directionnel doit exister par un simple appui). Une seule carte ouverte à la fois — comme le menu `⋯` aujourd'hui — pour qu'un bandeau oublié ne traîne pas derrière l'écran, et les boutons du bandeau restent `aria-hidden` et hors tabulation tant qu'il est fermé : un lecteur d'écran et un parcours clavier ne rencontrent jamais de commande invisible. Le retour de la carte honore `prefers-reduced-motion` (le suivi du doigt, lui, est de la manipulation directe et n'est pas une animation).

La paire, elle, cesse d'être deux cartes qui se disputent 390 px : elle s'empile, et sa marque de lien bascule à la verticale **dans l'axe des cases à cocher** plutôt qu'au centre. Ce détail décide de la lisibilité du lien : centré, le trait flotte entre deux blocs et se lit comme une simple séparation ; calé sur la colonne des cases, il prolonge une ligne que l'œil suit déjà et redit ce qu'il dit sur grand écran — ces deux cartes vont ensemble. Enfin, les cibles de 44 px sont obtenues **sans grossir le dessin** : là où agrandir déformerait l'objet (case à cocher, `⋯`, chevron de repli, croix de corbeille), c'est un `::after` en `inset: -Npx` qui étend la zone de frappe, la case gardant ses 18 px visuels. Le geste devient sûr, la carte reste dense — et le rendu desktop ne bouge pas d'un pixel. S'y ajoutent, plus discrets mais du même ordre, les champs portés à 16 px sous `(pointer: coarse)` — en dessous, iOS zoome à chaque mise au point et n'en ressort pas seul, ce qui casse la lecture pour tout le monde —, les marges de sécurité qui remettent la barre du haut sous l'encoche et les toasts au-dessus de la barre gestuelle, et le bouton corbeille de la vue globale qui redevient tout simplement atteignable, alors qu'il était jusqu'ici entièrement hors écran.

```
CASE À COCHER — cible sans grossissement
   ╭ ─ ─ ─ ─ ─ ╮  ::after { inset: -13px }
   │    ┌───┐   │  zone de frappe : 44 × 44
   │    │ ◻ │   │  dessin visible : 18 × 18 (inchangé)
   │    └───┘   │
   ╰ ─ ─ ─ ─ ─ ╯

PAIRE — empilée sous 720 px
┌──────────────────────────────────┐
│ ◻  Préparer le dossier        ⋯ │
└──┬───────────────────────────────┘
   ╎  ← trait vertical, aligné sur l'axe des cases
┌──┴───────────────────────────────┐
│ ◻  Relire le dossier          ⋯ │
└──────────────────────────────────┘
```
