---
slug: "chargement-borne"
title: "Ne plus charger ce qu'on n'affiche pas (#40)"
issues: [40]
pr: 82
created: 2026-08-29
completed: 2026-08-29
status: "Done"
---

# Synthèse

## Résumé

Le chargement initial ne rapatrie plus que ce que la grille affiche. La corbeille
charge à son ouverture. **377 501 → 7 372 octets** sur un compte de 4 420 tâches.

## Ce que la mesure a révélé, et que le ticket ignorait

**PostgREST plafonne ses réponses à 1000 lignes.** `Content-Range: 0-999/4420`.
L'application n'en recevait que mille, **sans erreur ni signal**.

Le tri se fait sur `position`, que les archives conservent : ouvertes et archivées
s'entrelacent. **Passé mille tâches, un compte perdait des tâches ouvertes en
silence.** Ce n'était pas un problème de volume, c'était une perte de données à
l'écran — et c'est le bénéfice principal de cette story, non prévu.

## Décisions et leur raison

**La ligne de partage se lit, elle ne s'invente pas.** `!done && !deleted` d'un
côté, `done || deleted` de l'autre : ce sont exactement les prédicats déjà écrits
dans les écrans. Le transport ne respectait pas une règle que l'affichage
appliquait déjà.

**`loadBin` fusionne dans `tasks`**, plutôt que d'alimenter une seconde liste.
Sans ça, « Rétablir » serait cassé : `patchTask` fait un `map`, et un `map` ne crée
rien — la tâche partirait en base sans jamais revenir à l'écran.

**On filtre le chargement, jamais la mémoire.** Une tâche cochée pendant la session
doit rester en mémoire : c'est `pending` qui la maintient affichée pendant les
quatre secondes d'annulation.

**Le compteur ne charge rien** — `head: true, count: 'exact'` rend un cardinal sans
transférer une ligne.

## Ce que le travail a mis au jour

**🐛 J'ai commencé par reproduire le défaut dans la corbeille.** Mon premier
`loadBin` chargeait tout le compte d'un coup : 4 401 attendus, **999 rendus**. Le
même plafond, au même endroit. Rendu scopé et **paginé** — une matrice peut
accumuler plus de mille tâches terminées, c'est son état normal au bout d'un an.

**🐛 Mon raisonnement sur le compteur était faux.** J'avais écrit que le compte
serveur et la mémoire étaient « disjoints par construction », donc additionnables.
Ils ne le sont pas : une corbeille chargée est **à la fois** en mémoire et dans le
compte d'une portée plus large. La vue globale affichait **8795** au lieu de 4398.

Corrigé en supprimant l'addition — une seule source à la fois, et `binVersion` pour
garder le compte serveur frais.

**Les deux ont été trouvées en testant, pas en relisant.** Le second était écrit
noir sur blanc dans mon propre plan, avec sa justification.

## Fichiers modifiés

- `apps/web/src/data/store.ts` — filtre, `loadBin`, `countBin`, `binVersion`
- `apps/web/src/data/useBinCount.ts` *(nouveau)* — le compteur, une fois pour deux écrans
- `apps/web/src/screens/Matrix.tsx`, `Global.tsx`
- `apps/extension/src/store.ts` — le filtre, et rien d'autre

Aucune migration. `packages/shared` intact.

## Tests et validation

- **Automatiques** : ✅ 100 partagés + 21 web · typecheck ✅ · build ✅ · CI ✅
- **Mesure** : 377 501 → 7 372 octets ; 1 000 lignes tronquées → 19 complètes
- **Navigateur**, 4 420 tâches, console sans erreur : compteur exact avant
  chargement (4400), délai d'annulation intact, corbeille complète en 251 ms,
  « Rétablir » ramène la tâche dans la grille, purge correcte, compteurs exacts
  sur les deux écrans qu'ils soient chargés ou non

## Et après

**Hors périmètre** : la corbeille rend ses 4 400 lignes d'un coup dans le DOM. Ça
tient, mais c'est un coût d'affichage que ce ticket ne traite pas — il portait sur
le chargement. À ouvrir si le besoin s'en fait sentir.
