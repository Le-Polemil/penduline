---
story: "Statistiques rétrospectives par case"
story_code: "statistiques"
issue: 48
created: 2026-09-01
completed: 2026-09-02
status: "Done"
---

# Synthèse

## Résumé

Un écran rétrospectif qui rend enfin ce que la matrice d'Eisenhower promet : dans quelle case
passe le temps. Quatre lectures sur une période choisie (30 jours, 3 mois, 12 mois) —
répartition par case, tendance semaine après semaine, délai moyen création → complétion,
comparaison entre matrices — précédées d'un constat formulé en clair.

## Ce que l'implémentation a appris au ticket

**Aucune migration de colonne, contrairement à #47.** Je m'attendais au même manque : pas de
`completed_at`, donc une date de complétion seulement approchée. Le correctif de #75 l'avait
réglé sans le savoir — depuis lui, cocher n'est plus qu'**une seule écriture** portant `done`
et `archived` ensemble. `updated_at` sur une tâche terminée **est** l'instant de complétion,
exactement. Là où #47 se heurtait à une donnée indécidable, #48 en avait une exacte par
construction ; ajouter une colonne aurait dupliqué ce que la base savait déjà.

**Tout est côté serveur, et ce n'est pas un choix.** Depuis #40 le client ne charge que les
tâches ouvertes, or ce ticket ne parle que de tâches terminées.

## Décisions

**Un `jsonb`, pas un `setof`.** `config.toml` porte `max_rows = 1000`, et ce plafond frappe
aussi les fonctions renvoyant des lignes, silencieusement — le piège de #40. Une table de faits
`semaine × matrice × case` fait ~2600 lignes sur un an : tronquée sans erreur, elle aurait
produit des statistiques fausses et muettes.

**Des sommes et des comptes, jamais des moyennes.** Une moyenne pré-calculée interdit tout
regroupement ultérieur ; moyenner des moyennes de tailles inégales est faux, et faux d'une
manière que personne ne remarque parce que l'ordre de grandeur reste plausible.

**Le fuseau en paramètre**, sur une mesure et non une intuition : `date_trunc('week', …)`
travaille en UTC, et une tâche terminée le lundi à 1 h du matin à Paris tombait dans la semaine
précédente.

**La forme plutôt que les couleurs.** Le validateur du skill `dataviz` a contredit mon plan :
la palette des quadrants échoue comme série catégorielle, dont un échec **dur** sur le plancher
de vision normale (*Faire* ↔ *Planifier*, ΔE 11,4 pour un plancher de 15). Ce n'est pas un
défaut de `quadrants.ts` — ces teintes colorent de grands panneaux titrés, jamais des segments
fins à distinguer par la couleur seule. La tendance est donc en **petits multiples** à échelle
commune : l'identité vient du titre du panneau. Inventer une seconde palette validée aurait
donné deux langues de couleurs pour les mêmes quatre concepts.

**La phrase énonce le fait, puis propose une lecture, et ne qualifie jamais la personne.** Le
ticket exigeait un ton factuel tout en donnant « tu éteins des incendies » en exemple — on a
gardé l'intention, écarté le registre.

## Trois défauts trouvés

1. **« À trier » comptait dans le total sans jamais s'afficher.** `total` portait sur les cinq
   cases, l'affichage sur quatre : les parts ne faisaient plus 100 % et le manque passait pour
   un arrondi.
2. **La phrase affirmait une dominance inexistante** — trouvé uniquement sur les données
   réelles, où cinq cases à 20 % produisaient « 20 % venait de Faire ». Corrigé par un critère
   de rapport, avec une branche honnête quand rien ne se détache.
3. **« ont attendu 0 jours en moyenne »** — clause omise sous un jour.

Les deux derniers n'étaient visibles qu'avec de vraies données. Des données de test calibrées
ne les auraient jamais montrés.

## Fichiers modifiés

**Base** — `apps/supabase/migrations/20260901140000_stats.sql` (nouveau)

**Partagé** — `packages/shared/src/stats.ts` et `stats.test.ts` (nouveaux), `index.ts`

**Web** — `screens/Stats.tsx`, `data/useStats.ts` (nouveaux), `App.tsx`, `screens/Home.tsx`,
`styles.css`

## Tests et validation

- **Linting** : aucun script de lint dans le dépôt.
- **Tests automatiques** : ✅ 183 verts (146 sur `main` + 37). La mutation « moyenne des
  moyennes » fait tomber le test dédié, seul et précisément.
- **Migration** : ✅ 12 vérifications en transaction annulée sur Postgres 15.8, dont les deux
  branches du fuseau et la RLS (`sub` inconnu → sections vides).
- **Validation manuelle** : ✅ desktop et mobile sous émulation tactile réelle. Vérification de
  bout en bout du piège de la moyenne des moyennes : **4,5 j affichés** là où le calcul faux
  donnerait 20,5 j. Comblement des semaines creuses vérifié (3 semaines à zéro sur 10).
  Exclusions vérifiées au niveau de la RPC. Données de test supprimées — 4428 tâches avant,
  4428 après.

## Notes pour la suite

- **Conflit de fusion attendu avec #47** (PR #100) dans `Home.tsx` et `styles.css` : les deux
  ajoutent un bouton dans `.home-lenses`. Le nom de conteneur est volontairement le même pour
  que la résolution soit triviale.
- **L'échelle commune aplatit un compte très irrégulier.** Sur la base locale, une semaine à
  4005 complétions écrase les autres. C'est la représentation honnête, mais à revoir si un vrai
  compte présente ce profil.
- **#19 (deadlines)** ajouterait un axe « respect des échéances ». Pas une dépendance.
- La migration de #48 est appliquée à la base locale.
