---
slug: "pieces-jointes"
title: "Pièces jointes : capturer une tâche avec son lien (#78)"
issues: [78]
created: 2026-08-29
completed: 2026-08-29
status: "Done"
---

# Synthèse

## Résumé

Une tâche porte désormais des **liens**, et la capture depuis le navigateur passe
par un **formulaire** qu'on relit avant d'écrire. PR **#87**, sixième et dernière
de la pile — et dernier ticket de la **Vague 2**.

## Les décisions

**Une table, pas une colonne.** Une tâche porte plusieurs liens ; une colonne
obligerait à choisir lequel compte.

**Le schéma d'URL est contraint en base.** Le front valide *aussi*, pour donner
un message plutôt qu'une erreur SQL opaque — mais c'est le `check` qui garantit
qu'un `javascript:` ne devienne jamais cliquable dans l'app web. Vérifié par
l'API, pas seulement en SQL.

**Une tâche sans lien n'affiche rien.** Pas de pastille vide, pas de bouton :
l'immense majorité des tâches n'aura jamais de lien, et l'ajout vit dans le menu.

**Le brouillon vit dans `chrome.storage.session`.** Une URL visitée est une
information personnelle : elle ne traîne pas sur le disque et ne survit pas au
navigateur. Aucune permission ajoutée — `storage` couvrait déjà `session`.

**Le repli est le comportement d'avant.** Si `chrome.action.openPopup()` manque
(Chrome < 127) ou échoue, on écrit directement. Une capture perdue en silence
serait pire que l'absence de formulaire.

## Ce que la validation a révélé

- **La destination retombait sur la première matrice** au lieu de celle
  qu'annonce l'entrée de menu. `null` est maintenant résolu dans le service
  worker, à la même source que le titre du menu.
- **Le brouillon perdait un champ sur deux** : `patchPending` faisait
  lire-puis-écrire, et deux frappes rapprochées dans deux champs différents
  lisaient la même version. La fonction a disparu — le formulaire écrit le
  brouillon entier.

## Tests et validation

- **Tests automatiques** : ✅ 146 (120 `shared` + 26 `web`)
- **Typecheck / build / build:ext** : ✅
- **CI sur #87** : ✅
- **Web** : ✅ les 5 points, plus RLS et complétion de schéma
- **Extension** : ✅ formulaire, préremplissage, brouillon, écriture réelle,
  permissions inchangées

## Limite de la validation, à lever

Chrome 151 refuse `--load-extension` et ne laisse pas attacher le service worker.
**L'appel réel à `chrome.action.openPopup()` et le chemin du menu contextuel
n'ont pas été exercés de bout en bout.** Le formulaire, lui, l'a été — servi hors
extension avec un bouchon `chrome.storage` fidèle et une écriture réelle en base.

À confirmer sur une extension chargée à la main avant publication au Web Store.

## À retenir pour la suite

⚠️ **Quatre migrations attendent la production**, dans cet ordre :
`search_tasks` (#45), `realtime` (#39), `subtasks` (#50), `task_attachments`
(#78). Chacune doit précéder le front qui l'utilise.
