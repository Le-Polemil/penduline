---
story: "Mot de passe oublié : parcours de récupération"
story_code: "mot-de-passe-oublie"
issue: 33
pr: 55
created: 2026-08-16
completed: 2026-08-16
status: "Done"
---

# Synthèse

## Résumé

Penduline n'avait aucun parcours de récupération de mot de passe : un utilisateur
qui l'oubliait perdait son compte définitivement, sans recours de son côté ni
possibilité d'intervention côté mainteneur. La story livre le parcours complet —
demande, e-mail, écran de nouveau mot de passe — plus la gestion de la
confirmation d'adresse à l'inscription, qui partage la même mécanique.

Le code est livré et vérifié. **Le parcours reste inerte en production** tant que
GoTrue n'a pas de SMTP : c'est le vrai obstacle, découvert pendant l'exploration
et documenté ci-dessous.

## Ce que l'exploration a révélé

La production n'est pas un projet supabase.com mais un **Supabase auto-hébergé**
sur Coolify, dégraissé à PostgREST + GoTrue. Son endpoint public annonçait
`"mailer_autoconfirm": true`, et `work/coolify-deploy.md:36` en donnait la
raison : **aucun SMTP configuré**.

L'auto-confirmation des inscriptions n'était donc pas un choix produit, c'était
un contournement de cette absence. Ce qui change la nature du ticket : configurer
le SMTP n'est pas une tâche annexe, c'en est le prérequis. Aucune ligne de code
ne peut compenser un GoTrue incapable d'envoyer un e-mail.

## Changements réalisés

**Parcours web** — `SignIn` gagne un troisième mode `forgot` plutôt qu'un écran
séparé ; nouveau composant `NewPassword` atteint depuis le lien reçu ; drapeau
`recovering` testé avant `session` au rendu ; message explicite après une
inscription qui n'ouvre pas de session.

**Extension** — un lien vers le parcours web, sans duplication.

**Gabarits d'e-mail** — deux fichiers HTML en français, servis en statique par
l'app web comme l'est déjà `/confidentialite/`.

**Configuration** — local aligné sur la prod visée (`enable_confirmations`,
port 5174 dans les URL autorisées) ; procédure SMTP Resend consignée.

## Décisions et leur raison

**Aucun routeur introduit.** `auth-js` 2.110.8 est en `flowType: 'implicit'` avec
`detectSessionInUrl` : les jetons arrivent dans le fragment d'URL et le client
émet `PASSWORD_RECOVERY` sur `onAuthStateChange`, auquel `App.tsx` s'abonnait
déjà. Ajouter une dépendance de routage pour un seul écran aurait été
disproportionné.

**Bénéfice non anticipé** du flux implicit : sans code verifier à retrouver en
stockage local, **le lien fonctionne depuis n'importe quel navigateur**. On peut
demander la réinitialisation sur son ordinateur et ouvrir le mail sur son
téléphone — ce qu'un flux PKCE aurait interdit. C'est une propriété qu'il faudra
préserver si le `flowType` venait à changer.

**`recovering` prime sur `session`.** Le lien de récupération *ouvre* une
session : sans cette précédence, l'application s'afficherait normalement et
l'écran de changement de mot de passe serait sauté — l'utilisateur repartirait
avec son ancien mot de passe, croyant l'avoir changé.

**Silence délibéré sur la réinitialisation.** Message identique que l'adresse ait
un compte ou non, erreurs réelles non distinguées à l'écran. Exception assumée au
principe de #34 : différencier permettrait d'énumérer les comptes existants.
À répercuter dans #34.

**Réplication plutôt qu'abstraction pour l'extension.** Le parcours n'y est pas
porté : un popup de 400×600 se ferme au moindre clic ailleurs, soit exactement ce
que fait l'utilisateur qui va consulter sa boîte mail.

## Le bug qui n'aurait pas été visible en production

Le message de lien expiré ne s'affichait pas, alors que le fragment d'URL était
bien nettoyé.

`readAuthHash` servait d'initialiseur à `useState` **tout en ayant un effet de
bord** (`replaceState`). Or `main.tsx` monte l'application dans `<StrictMode>`,
qui invoque l'initialiseur **deux fois** en développement : le premier appel
effaçait le fragment, le second ne trouvait plus rien et renvoyait un message nul.

Le cas `type=recovery` passait au vert parce qu'il ne déclenche aucun nettoyage —
son initialiseur était accidentellement pur. Cette asymétrie est ce qui rendait le
symptôme difficile à soupçonner sans dérouler les deux chemins.

Corrigé en rendant l'initialiseur strictement pur et en déplaçant le nettoyage
dans un `useEffect` : un `replaceState` joué deux fois est sans conséquence,
contrairement à une lecture qui ne retrouve plus sa source.

**StrictMode ne double pas les appels en production.** Ce bug aurait donc
survécu au déploiement sans jamais se manifester, jusqu'au jour où quelque chose
d'autre aurait rejoué l'initialiseur.

## Fichiers modifiés

- `apps/web/src/App.tsx` — cœur du lot
- `apps/web/src/styles.css` — classe `.notice`
- `apps/web/public/emails/recovery.html` *(nouveau)*
- `apps/web/public/emails/confirmation.html` *(nouveau)*
- `apps/extension/src/App.tsx`, `apps/extension/src/styles.css`
- `apps/supabase/config.toml`
- `work/coolify-deploy.md`
- `.gitignore` — artefacts CLI Supabase à la racine

Aucune migration SQL.

## Tests et validation

- **Typecheck** : ✅ trois workspaces
- **Build** : ✅ trois workspaces
- **Lint / tests automatiques** : ⚠️ le dépôt n'en a pas — voir #31
- **Validation manuelle** : ✅ quatre chemins d'affichage vérifiés en navigateur
  isolé (lien présent, mode `forgot`, fragment `type=recovery`, fragment
  `error_description`), plus la non-régression après correction du bug
- **Bout en bout avec envoi réel** : ⛔ bloqué sur le SMTP

## Reste à faire

1. **Configurer le SMTP Resend** sur GoTrue — sans quoi le parcours ne fait rien
2. Vérifier de bout en bout en production
3. **Ensuite seulement**, passer `ENABLE_EMAIL_AUTOCONFIRM=false`

Cet ordre n'est pas négociable : l'inverse enfermerait dehors tout nouvel inscrit
si l'envoi ne fonctionnait pas.

## À traiter ailleurs

Le dégraissage du compose a **retiré les Edge Functions**
(`work/coolify-deploy.md:81`). Or **#36** (suppression de compte RGPD) et **#25**
(point d'entrée HTTP) reposent tous deux sur une Edge Function dans leur
rédaction actuelle. Ces deux tickets sont à réécrire avant d'être pris.
