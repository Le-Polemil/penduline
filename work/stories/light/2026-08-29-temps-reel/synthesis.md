---
slug: "temps-reel"
title: "Synchronisation temps réel (#39)"
issues: [39]
pr: 84
created: 2026-08-29
completed: 2026-08-29
status: "Done"
---

# Synthèse

## Résumé

Deux onglets, ou deux appareils, voient désormais la même chose sans rechargement.
Abonnement `postgres_changes` sur `tasks`, `boards` et `universes`, filtré par
utilisateur.

## Ce que la vérification préalable a évité

**La publication `supabase_realtime` était vide.** Le service tourne bien — il ne
faisait pas partie des sept retirés lors du dégraissage — mais sans table
déclarée, un client s'abonne, reçoit `SUBSCRIBED`, et **rien d'autre**. Aucune
erreur, aucun symptôme.

L'avoir cherché *avant* d'écrire le client a économisé une journée de débogage
d'un code parfaitement correct.

## Décisions et leur raison

**`replica identity full`, et ce n'est pas une optimisation.** Sans elle, un
DELETE ne porte que la clé primaire — et Realtime applique la RLS avant de
délivrer : sur une ligne réduite à son `id`, `user_id = auth.uid()` n'a rien à
évaluer, et l'événement **n'est pas délivré**. Purger dans un onglet aurait laissé
la ligne affichée dans l'autre.

**L'écho par comparaison, pas par marquage.** Suivre les identifiants écrits
supposerait de savoir quand les oublier : trop tôt on rate une modification
distante, trop tard on l'ignore. Comparer ne se trompe jamais, et rendre la même
référence quand rien ne change supprime le scintillement.

**Le temps réel respecte #40.** Un INSERT distant n'entre que s'il appartient à
l'ensemble de travail — sinon la synchronisation réintroduirait les archives que
#40 en a sorties. `inWorkingSet` est extraite et partagée : la règle n'est écrite
qu'une fois.

**Reconnexion ⇒ rechargement complet.** Les événements manqués pendant une coupure
sont perdus ; les rejouer est impossible, donc on repart de la vérité.

## Ce que le travail a mis au jour

**🐛 Deux défauts dans mon premier jet**, corrigés avant tout essai : une ref
utilisée sans être déclarée, et surtout un `sink` capturé dans l'effet — il aurait
figé `reload` et `admits` au premier rendu, donc le rechargement de reconnexion
aurait rappelé une fonction périmée. Passé par une ref tenue à jour.

**La suppression d'une matrice nettoie ses tâches à la main.** `on delete cascade`
les emporte côté base, mais aucun événement ne le dit : sans ce nettoyage, elles
resteraient en mémoire, rattachées à une matrice disparue.

**Les brouillons survivent parce qu'ils ne sont pas dans `tasks`.** Le plan le
supposait ; le test l'a confirmé, y compris à travers un rechargement complet de
reconnexion.

## Fichiers modifiés

- `apps/supabase/migrations/20260829140000_realtime.sql` *(nouveau)*
- `apps/web/src/data/useRealtime.ts` *(nouveau)*
- `apps/web/src/data/store.ts`

## Tests et validation

- **Automatiques** : ✅ 100 + 21 · typecheck ✅ · build ✅ · CI ✅
- **Deux onglets réels** : création, cochage et suppression définitive se
  propagent ; une saisie garde texte **et** focus pendant une écriture distante ;
  un glisser en cours aboutit malgré un INSERT reçu en plein geste ; après
  **coupure réelle du service**, l'onglet se resynchronise et récupère ce qu'il
  avait manqué

## Avant de déployer

La migration doit atteindre la production **avant** le front — sans elle,
l'abonnement reste muet.

## Et après

L'extension est hors périmètre : son popup charge à chaque ouverture et vit
quelques secondes. Le ticket l'admettait.
