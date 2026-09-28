# Le temps réel qui meurt en dormant

Symptôme rapporté le 2026-09-28 : des tâches ajoutées sur un poste n'apparaissaient
pas dans le panneau d'extension d'un second poste, laissé ouvert. Refermer et rouvrir
le panneau remettait tout d'aplomb. D'où la question posée : « y a-t-il une durée de
souscription ? »

**Non.** Rien n'expire côté abonnement. Deux autres choses expirent, et une troisième
empêchait de s'en apercevoir.

## La cause

Le battement de cœur de Realtime tournait sur un `setInterval` **de la page**. Un
navigateur bride lourdement les minuteurs d'un document en arrière-plan : le battement
s'espace, cesse, le serveur ferme la connexion — et le client ne le détecte pas, parce
que c'est ce même minuteur qui devait le détecter.

## Le défaut qui a fait durer la panne

Le panneau avait déjà un rattrapage, à deux endroits, tous deux gardés par
`if (store.live) return`.

Or `live` était nourri par `onLive`, c'est-à-dire par le **dernier statut rapporté** par
la bibliothèque. Sur une mort silencieuse, aucun statut n'est rapporté : `live` restait
`true`, les deux rattrapages sortaient sans rien faire, et le panneau affichait un état
figé indéfiniment.

> Un filet de sécurité suspendu au seul signal que la panne empêche de mettre à jour.

C'est la leçon à retenir, et elle dépasse ce bug : **ne jamais garder un rattrapage par
un drapeau que seule la chose cassée peut mettre à jour.**

## Les décisions

**Le battement passe dans un Web Worker.** Un worker n'est pas bridé comme la page : le
battement continue, la coupure est vue, la bibliothèque se reconnecte d'elle-même. Ça
traite la cause plutôt que le symptôme.

**Un fichier de worker, pas le `blob:` par défaut.** supabase-js sait fabriquer ce worker
seul à partir d'un blob. On ne s'en sert pas : dans une extension MV3, `blob:` relève de
`script-src`, qui vaut `'self'`, et le comportement a varié selon les versions de Chrome.
Un fichier de même origine ne pose la question nulle part. Le prix est une duplication
assumée entre `apps/web/public/` et `apps/extension/public/` — un worker doit venir de
l'origine de la page qui l'ouvre, il ne peut pas être partagé.

**`subscribeRealtime` rend désormais un objet, pas une fonction.** `{ stop, vivant }` :
`vivant()` **interroge** l'état du canal et du socket au moment de l'appel, au lieu de
rendre une valeur mémorisée. `onLive` reste utile pour réagir à une bascule ; `vivant()`
est ce sur quoi on décide.

**Le web reçoit le même filet.** Il n'en avait aucun — il ne consommait même pas
`onLive`. Un onglet ouvert longtemps pouvait diverger en silence sans le moindre
rattrapage : le défaut de #39 revenu par une autre porte.

## Le résidu assumé

`vivant()` n'est pas une certitude absolue : un socket dont la connexion est morte sans
fermeture propre reste `OPEN` jusqu'à ce que le navigateur s'en aperçoive. C'est le
battement qui rend ce constat fiable — les deux morceaux se tiennent, et retirer le
worker en croyant que le filet suffit ramènerait le bug sous une forme plus discrète.
