---
slug: "echecs-ecriture-visibles"
title: "Les échecs d'écriture sont invisibles pour l'utilisateur"
issue: 34
created: 2026-08-18
---

# Contexte

## Description fonctionnelle

Penduline écrit de façon optimiste : le geste de l'utilisateur s'affiche immédiatement, la
persistance suit. C'est le bon choix — mais il n'a jamais été complété par son revers. Aucun
chemin d'écriture ne sait reculer. Réseau coupé, session expirée, policy RLS : l'application
affiche un succès, et le geste s'évapore au rechargement suivant.

La valeur livrée n'est pas une fonctionnalité, c'est une **promesse tenue**. Un outil où l'on
range ses tâches doit garantir qu'un rangement affiché est un rangement enregistré — ou dire
qu'il ne l'est pas. Tant qu'il y a dix utilisateurs, c'est un bug qu'on découvre en aidant
quelqu'un. Passé cette échelle, c'est la phrase « l'application perd mes tâches », et elle ne
se rattrape pas.

Trois garanties, sur les douze chemins d'écriture du produit (web et extension) :

1. **Ce qui échoue recule.** L'état revient à ce qu'il était avant le geste — pas de fantôme
   affiché, pas de matrice supprimée qui reste supprimée à l'écran seulement.
2. **Ce qui échoue se voit.** Un message, en clair, qui dit quel geste n'a pas passé et
   pourquoi.
3. **Ce qui peut se rejouer se rejoue.** « Réessayer » sur une coupure réseau. Mais pas sur un
   refus de policy : proposer un bouton qui échouera à coup sûr est pire que ne rien proposer.

Hors périmètre : la file d'attente hors-ligne et le rejeu différé (#28). Ici on ne cherche pas
à sauver l'écriture plus tard — on veut qu'un échec soit visible et réversible **tout de suite**.

## Vue architecturale

Trois couches, la logique décidable extraite de React pour être testable en environnement
`node` — conformément à ce que `vitest.base.mts` a posé.

```
  packages/shared/src/write.ts
  ┌──────────────────────────────────────────┐
  │ classifyWriteFailure(error, status, …)    │  pur, testé
  │   status 0     → offline   rejouable     │
  │   401 / PGRST3 → session   non rejouable │
  │   403 / 42501  → denied    non rejouable │
  │   sinon        → unknown   rejouable     │
  └──────────────────────────────────────────┘
                    ▲
  apps/web/src/data/persist.ts        apps/web/src/components/Toast.tsx
  ┌───────────────────────────┐       ┌──────────────────────────┐
  │ apply()   optimiste       │──────▶│ show({ key, tone,        │
  │ write()   Supabase        │       │        action })         │
  │ revert()  si échec        │       │ un seul hôte, empilé     │
  │ + « Réessayer » si rejou. │       │ dédup / remplace par clé │
  └───────────────────────────┘       └──────────────────────────┘
                    ▲
  apps/web/src/data/store.ts          apps/extension/src/store.ts
  les 10 chemins d'écriture           les 2 chemins du popup
```

**La décision structurante** : tout se joue **à l'intérieur** des méthodes du store. Aucune
signature de `Store` ne change, aucun appelant n'est modifié — `Home.tsx`, `Matrix.tsx` et
`Global.tsx` gardent leurs `void store.x()` et leurs gardes sur `null`. Sans quoi la gestion
d'erreur se serait répandue dans trois écrans et aurait dérivé, exactement comme le markup du
toast a dérivé entre `Matrix` et `Global`.

**Le retour arrière est ciblé, pas global.** On capture les lignes touchées avant de muter et on
les remet par id. Un `reload()` aurait été plus court, mais il efface visuellement une écriture
concurrente encore en vol — et hors-ligne il échoue lui aussi, donc l'annulation ne se verrait
même pas.

**Impact sur l'existant** : `useCompletion` cesse de rendre son toast pour le publier dans
l'hôte, et le markup dupliqué de `Matrix.tsx` / `Global.tsx` disparaît. La classification
vivant dans `packages/shared`, l'extension la réutilise sans copier de règles.

## Impacts UX

Le point sensible est la **cohabitation des toasts**. Cocher une tâche hors-ligne déclenche à
la fois le toast « terminée / Annuler » et un toast d'erreur : aujourd'hui deux `position:
fixed` au même endroit se recouvriraient. D'où l'hôte unique, qui empile en colonne.

```
                                  ┌──────────────────────────────────────────────┐
   erreur, la plus récente en bas  │ ⚠ « Ranger la tâche » — connexion perdue     │
                                  │                                  Réessayer   │
                                  └──────────────────────────────────────────────┘
                                  ┌──────────────────────────────────────────────┐
   toast neutre existant           │ « Relire le brief » terminée      Annuler    │
                                  └──────────────────────────────────────────────┘
```

Un geste sur une paire produit deux écritures : la **déduplication par clé** garantit un seul
message, pas deux fois le même empilés.

Le message nomme le geste, pas la fonction technique : « Renommer la matrice », pas
`renameBoard`. Et un `denied` n'affiche pas « Réessayer » — un bouton qui échouera à coup sûr
transforme une erreur en piège.

**Accessibilité** : les toasts d'erreur portent `role="alert"` (annonce assertive), les neutres
`role="status"`. Un lecteur d'écran les restitue donc sans passer par `useAnnounce` — le
provider d'annonces reste réservé aux changements muets, ce pour quoi il a été écrit. Le
contraste du toast est déjà conforme (fond `neutral-900`, texte blanc) ; la variante d'erreur
devra l'être aussi, et le bouton d'action recevoir un focus visible comme le reste depuis #38.

**Session expirée** : la redirection vers la connexion est brutale si elle fait perdre l'écran
où l'on était. La vue courante est donc mémorisée en `sessionStorage` et restaurée après
reconnexion — on revient dans sa matrice, pas à l'accueil.
