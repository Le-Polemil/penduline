---
slug: "pieces-jointes"
title: "Pièces jointes : capturer une tâche avec son lien (#78)"
issues: [78]
created: 2026-08-29
status: "In Progress"
---

# #78 — Pièces jointes, et une capture qu'on peut relire

## Contexte

La capture contextuelle de #52 marche, mais **en aveugle** : un clic, une
pastille, la tâche est écrite. On ne voit pas ce qui a été retenu et on ne peut
rien corriger.

Surtout, **l'URL est perdue**. `titleFrom()` ne s'en sert que comme titre de
repli. Clic droit sur le nom d'une issue GitHub qu'on vient de surligner : le
titre est bon, le lien s'évapore. Or c'est le lien qui rend la tâche actionnable
trois jours plus tard.

## Décisions

**Une table, pas une colonne.** Une tâche porte plusieurs liens — une issue et sa
PR, un article et sa discussion. `task_attachments` avec `position`
fractionnaire, comme les tâches.

**Le schéma d'URL est contraint EN BASE, pas seulement à la saisie.** Un
`javascript:` qui entrerait par l'API finirait cliquable dans l'app web. La
contrainte est la seule barrière que rien ne contourne — ni un client tiers, ni
une version future du front.

**Les pièces jointes sont chargées avec le reste, en une requête paginée.** Le
piège de #40 (troncature silencieuse à 1000 lignes) s'applique ici aussi : la
pagination n'est pas une optimisation, c'est la correction du défaut par
construction.

**Le repli si `chrome.action.openPopup()` manque, c'est le comportement actuel.**
L'API n'est sortie du canal dev qu'avec Chrome 127. Une capture perdue en silence
serait pire que l'absence de formulaire : on capture directement, comme avant.

**Le brouillon vit dans `chrome.storage.session`.** Le popup d'action se ferme
dès qu'il perd le focus — cliquer dans la page pour relire un titre ne doit pas
effacer la saisie. Aucune permission de plus : `storage` couvre déjà `session`.

## Tâches

1. Migration `task_attachments` : RLS propriétaire, contrainte `http(s)`, index
2. `packages/shared` : type `Attachment`, `attachmentsOf`, `hostLabel`, tests
3. Store web : chargement paginé, `addAttachment`, `removeAttachment`
4. Affichage web : les liens sur la carte, ajout et suppression
5. Extension : capture en attente, formulaire dans le popup, repli
6. Vérifications automatiques
7. Validation en navigateur
8. Commit, PR fermant #78

## Vérifications

```bash
npm test && npm run typecheck && npm run build
```

### Plan de test

1. Ajouter un lien à une tâche, le voir sur la carte, l'ouvrir en nouvel onglet
2. Un `javascript:` est refusé — **par la base**, pas seulement par le champ
3. Plusieurs liens sur une tâche, supprimés un à un
4. Une tâche sans lien garde **exactement** l'apparence actuelle
5. Supprimer la tâche emporte ses liens (`on delete cascade` au vidage définitif)
6. Extension : clic droit sur un lien → formulaire prérempli titre + URL
7. Le brouillon survit à une fermeture accidentelle du popup
8. Repli testé si `chrome.action.openPopup` est indisponible
9. Aucune permission ajoutée au manifeste

## Livraison

Branche `story-light/pieces-jointes` depuis `story-light/sous-taches` — sixième
de la pile. PR assignée à `@me`, fermant **#78**.
