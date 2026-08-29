---
slug: "annulation"
title: "Annuler ses gestes (#46)"
issues: [46]
created: 2026-08-29
status: "In Progress"
---

# #46 — Annuler ses gestes

## Contexte

Le seul geste annulable du produit est la complétion, via son toast de quatre
secondes. Tout le reste est définitif à l'écran : un glisser raté, une tâche
envoyée dans la mauvaise case, une suppression — il faut passer par la corbeille
ou refaire à la main.

C'est d'autant plus gênant que **toute l'interface consiste à déplacer des
choses**. Déplacer doit être sans conséquence, sinon on hésite avant chaque geste
— et l'hésitation est précisément ce qu'une matrice d'Eisenhower supprime.

## La moitié du travail est déjà écrite

`persist` capture **l'état d'avant** de chaque écriture, pour pouvoir la défaire
si la persistance échoue (#34). `previousValues(task, patch)` calcule déjà le
patch inverse.

Autrement dit : l'annulation existe, elle ne sert simplement qu'en cas d'échec.
Ce ticket la rend disponible sur demande.

**Et les six gestes listés sont tous des patchs** — déplacement, réordonnancement,
épinglage, suppression, renommage, changement de matrice. Aucun n'est une
création. L'inverse d'un patch est un patch : il n'y a pas de second mécanisme à
inventer.

---

## Décisions

**Les écritures se groupent.** Déplacer une paire produit deux `patchTask` ; les
empiler séparément ferait annuler une moitié de paire au premier `Ctrl+Z`. D'où
`group(label, fn)` : tout ce qui s'écrit pendant `fn` forme **une** entrée.

**On n'empile qu'en cas de succès.** Si l'écriture échoue, `persist` a déjà remis
l'état d'avant : empiler un inverse ferait annuler quelque chose qui n'a jamais eu
lieu, et produirait le « troisième état » que le ticket redoute.

**La pile est locale et par session**, comme le dit le ticket. L'étendre entre
appareils ouvrirait une boîte de Pandore pour un gain nul.

**Elle se vide au changement de matrice et au rechargement de reconnexion.**
Annuler dans un contexte devenu faux est pire que ne pas pouvoir annuler.

**Le raccourci ne s'arme pas dans un champ de saisie.** `Ctrl+Z` y appartient au
navigateur — le détourner ferait perdre une frappe au lieu d'annuler un geste.

---

## Tâches

### 1. `apps/web/src/data/undo.ts`

La pile, ses deux sens, et le type d'entrée. Rien de React : une structure et ses
règles, testable.

```
UndoEntry = { label: string; inverses: TaskWrite[] }
```

Plafond à 10, comme le ticket le suggère.

### 2. `apps/web/src/data/store.ts`

- `patchTask` pousse son inverse dans le groupe ouvert — **après succès**.
- `group(label, fn)` ouvre, collecte, referme et empile.
- `undo()` / `redo()` : appliquent les inverses **sans se ré-empiler**, et
  alimentent l'autre pile.
- `clearUndo()` pour les moments où le contexte change.

### 3. Les écrans

`apply(writes)` devient `apply(label, writes)` dans `Matrix.tsx` et `Global.tsx`.
Le libellé dit **le geste**, pas l'objet : « Déplacée vers Planifier », pas
« Tâche modifiée ».

`taskLabel(patch)` existe déjà dans le store pour nommer les échecs — le même
vocabulaire sert ici, pour que l'utilisateur lise la même chose dans les deux
situations.

### 4. `apps/web/src/data/useUndoShortcut.ts`

`Ctrl+Z` / `Cmd+Z`, `Ctrl+Maj+Z` / `Cmd+Maj+Z`. Inerte dans un champ de saisie.
Le toast annonce ce qui vient d'être annulé — sans lui, `Ctrl+Z` agit dans le vide
pour qui ne regardait pas au bon endroit.

---

## Ce qu'on ne fait pas, et pourquoi

**Annuler une création.** Le ticket ne la liste pas, et l'inverse d'un INSERT est
une suppression définitive — un geste bien plus lourd que celui qu'on défait.

**Se réconcilier avec le temps réel (#39).** Une entrée peut désigner une tâche
qu'un autre appareil a modifiée depuis ; l'inverse l'écraserait. La pile étant
vidée à la reconnexion, la fenêtre est étroite, et le ticket a tranché : locale et
par session. À dire dans la PR plutôt qu'à laisser découvrir.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

La pile est testable sans React : plafond, ordre, refaire après annuler, pile de
rétablissement vidée par une action neuve.

### Plan de test

1. Déplacer une tâche entre cases → `Ctrl+Z` la ramène
2. **Une paire** déplacée → `Ctrl+Z` ramène **les deux** *(le piège du groupement)*
3. Supprimer → `Ctrl+Z` la restaure
4. Renommer → `Ctrl+Z` rend l'ancien titre
5. Épingler, changer de matrice, réordonner → idem
6. `Ctrl+Maj+Z` rétablit
7. Une action neuve après une annulation **vide** la pile de rétablissement
8. **Dans un champ de saisie**, `Ctrl+Z` annule le texte, pas le geste précédent
9. Changer de matrice → la pile est vide, `Ctrl+Z` ne fait rien
10. Chaque annulation affiche un toast qui **nomme** le geste

### Livraison

Branche `story-light/annulation` depuis `story-light/temps-reel` — quatrième de la
pile. PR assignée à `@me`, fermant **#46**.
