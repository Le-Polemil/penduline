---
story: "Mot de passe oublié : parcours de récupération"
story_code: "mot-de-passe-oublie"
issue: 33
created: 2026-08-16
status: "Done"
---

# Journal de développement

## Progression

| # | Tâche | Statut | Date |
|---|-------|--------|------|
| 1 | Configurer SMTP Resend sur GoTrue *(utilisateur, Coolify)* | En attente | |
| 2 | Gabarits d'e-mail FR (`recovery.html`, `confirmation.html`) | Terminé | 2026-08-16 |
| 3 | Web — écran « Mot de passe oublié » (mode `forgot` de `SignIn`) | Terminé | 2026-08-16 |
| 4 | Web — écran « Nouveau mot de passe » (état `recovering`) | Terminé | 2026-08-16 |
| 5 | Web — inscription avec confirmation d'e-mail | Terminé | 2026-08-16 |
| 6 | Extension — lien vers le parcours web | Terminé | 2026-08-16 |
| 7 | Bascule `ENABLE_EMAIL_AUTOCONFIRM=false` *(utilisateur, Coolify)* | En attente | |
| 8 | Documentation (`coolify-deploy.md`, `config.toml`) | Terminé | 2026-08-16 |
| 9 | Vérifications qualité + test manuel bout en bout | Terminé | 2026-08-16 |

## Journal

### 2026-08-16 — Tâche 2 : gabarits d'e-mail en français

**Statut** : Terminé

**Actions réalisées** :
- Créé `recovery.html` et `confirmation.html`, servis en statique par l'app web
  (même mécanisme que `/confidentialite/`, déjà en production).
- Ton et palette alignés sur le produit : fond `#f5ead8`, carte `#fdf6e9`,
  bouton `#c67139`.
- Les deux messages disent explicitement quoi faire si l'on n'est pas à l'origine
  de la demande — c'est ce qui distingue un e-mail transactionnel légitime d'un
  message d'hameçonnage aux yeux du destinataire comme des filtres.

**Fichiers modifiés** :
- `apps/web/public/emails/recovery.html` (nouveau)
- `apps/web/public/emails/confirmation.html` (nouveau)

**Notes** : l'e-mail n'obéit pas aux mêmes règles que le web, et le gabarit s'en
ressent — c'est délibéré, pas de la négligence :
- mise en page en `<table>`, parce qu'Outlook rend le HTML avec le moteur de Word,
  qui ignore flex et grid ;
- styles **en ligne** uniquement, Gmail retirant les blocs `<style>` dans plusieurs
  contextes (lecture mobile, transfert) ;
- **polices système**, pas Caprasimo ni Figtree : les clients mail ne chargent pas
  les polices distantes de façon fiable et beaucoup bloquent les ressources externes.
  L'identité passe donc par la couleur, pas par la typographie ;
- l'URL est répétée en texte brut, parce que les passerelles de sécurité d'entreprise
  réécrivent ou neutralisent régulièrement les liens de bouton.

Le jeton `{{ .ConfirmationURL }}` est substitué par GoTrue, qui télécharge le gabarit
à son URL publique — d'où l'hébergement dans `public/` plutôt que dans le bundle.

### 2026-08-16 — Tâches 3 à 5 : le parcours côté web

**Statut** : Terminé

**Actions réalisées** :
- `SignIn` gagne un troisième mode `forgot`, plutôt qu'un écran séparé : le
  composant bascule déjà entre connexion et inscription, l'ajout reste homogène
  et l'utilisateur ne change pas de cadre visuel.
- Nouveau composant `NewPassword`, atteint depuis le lien reçu par e-mail.
- Drapeau `recovering` dans `App()`, testé **avant** `session` au rendu.
- Après `signUp()` sans session ouverte, message « vérifiez votre boîte mail »
  au lieu du silence actuel.

**Fichiers modifiés** :
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css` (classe `.notice`)

**Notes** :

*Le plan a été rectifié en cours de route.* Il prévoyait de nettoyer le fragment
d'URL à la main après traitement. La lecture d'`auth-js` 2.110.8 montre que la
librairie le fait déjà (`GoTrueClient.js:3278`) — mais **uniquement en cas de
succès** : sur un lien expiré elle lève avant d'y arriver (`:3207`). Le nettoyage
manuel est donc restreint au seul cas d'erreur. L'écrire sans cette vérification
aurait effacé les jetons avant que la librairie ne les lise, cassant le cas
nominal.

*Course évitée.* `PASSWORD_RECOVERY` n'est émis qu'après un aller-retour réseau.
Plutôt que de parier sur l'ordre d'enregistrement de l'abonnement, `recovering`
est initialisé depuis le fragment dès le premier rendu. Les deux sources se
confirment sans se contredire : un lien expiré porte `error_description` et
jamais `type=recovery`, les cas sont disjoints.

*Silence délibéré sur la réinitialisation.* Le message est identique que l'adresse
ait un compte ou non, et les vraies erreurs partent en `console.error` sans être
distinguées à l'écran. C'est une exception assumée au principe de #34 (remonter
les échecs) : différencier permettrait d'énumérer les comptes existants. À
signaler dans #34 pour que la règle générale prévoie l'exception.

*Vouvoiement.* Les nouvelles chaînes vouvoient, comme `Home.tsx` et la page de
confidentialité. « Connexion à ton compte » était le seul tutoiement du produit
et devenait incohérent une fois entouré des nouveaux libellés — corrigé en
« votre compte ».

### 2026-08-16 — Tâche 6 : extension

**Statut** : Terminé

**Actions réalisées** :
- Lien « Mot de passe oublié ? » sous le formulaire de connexion du popup,
  ouvrant `WEB_APP_URL` dans un onglet.

**Fichiers modifiés** :
- `apps/extension/src/App.tsx`
- `apps/extension/src/styles.css` (classe `.signin-forgot`)

**Notes** : aucune duplication du parcours. Un popup de 400×600 se ferme au
moindre clic ailleurs — soit exactement ce que fait l'utilisateur qui va
consulter sa boîte mail. Le style est volontairement plus discret que
`.signin-link` : c'est une porte de secours, pas une action de même rang que
« créer un compte ».

**Vérifications** : `npm run typecheck` et `npm run build` passent sur les trois
workspaces (shared, web, extension).

### 2026-08-16 — Tâche 8 : documentation et alignement du local

**Statut** : Terminé

**Actions réalisées** :
- `work/coolify-deploy.md` : nouvelle section « SMTP et e-mails transactionnels »
  (choix de Resend, variables, gabarits, ordre d'exécution). Le gotcha de la
  ligne 36 renvoie désormais vers elle.
- `apps/supabase/config.toml` : `enable_confirmations` passé à `true` pour que
  le local reflète la prod visée, et `http://localhost:5174` ajouté aux URL de
  redirection autorisées.

**Fichiers modifiés** :
- `work/coolify-deploy.md`
- `apps/supabase/config.toml`

**Notes** : le port 5174 n'est pas une lubie — Vite prend le premier port libre
à partir de 5173, donc `redirectTo` vaut 5174 dès qu'une autre instance tourne,
et GoTrue rejette toute URL absente de la liste. C'est le genre d'échec qui se
diagnostique mal parce qu'il ne survient qu'une fois sur deux.

Activer la confirmation en local ne coûte aucun confort : Inbucket capture les
mails sur `http://127.0.0.1:54324`, il n'y a jamais de vraie boîte à ouvrir.

### 2026-08-16 — Tâche 9 : vérifications

**Statut** : Terminé

**Actions réalisées** :
- `npm run typecheck` et `npm run build` : aucune erreur sur les trois workspaces.
- Vérification visuelle des quatre chemins d'affichage dans un contexte de
  navigateur isolé (pour ne pas toucher à la session ouverte).

**Résultats** :

| Chemin testé | Résultat |
|---|---|
| Connexion : lien « Mot de passe oublié ? » présent | ✅ |
| Mode `forgot` : adresse seule, « Envoyer le lien », retour | ✅ |
| Fragment `type=recovery` → écran nouveau mot de passe | ✅ |
| Fragment `error_description` → message + fragment nettoyé | ✅ après correction |

**🐛 Bug trouvé et corrigé pendant le test.**

Le message de lien expiré ne s'affichait pas, alors que le fragment était bien
nettoyé. Cause : `readAuthHash` servait d'initialiseur à `useState` **tout en
ayant un effet de bord** (`replaceState`). Or `main.tsx` monte l'app dans
`<StrictMode>`, qui invoque l'initialiseur **deux fois** en développement — le
premier appel effaçait le fragment, le second ne trouvait plus rien et renvoyait
un message nul.

Le cas `type=recovery` passait au vert parce qu'il ne déclenche aucun nettoyage :
son initialiseur était accidentellement pur. C'est ce qui rendait le bug
asymétrique, donc difficile à soupçonner sans le test.

Correction : initialiseur rendu **strictement pur**, nettoyage déplacé dans un
`useEffect`. Un `replaceState` joué deux fois est sans conséquence, contrairement
à une lecture qui ne retrouve plus sa source.

À noter : StrictMode ne double pas les appels en production, donc ce bug
**n'aurait pas été visible après déploiement**. Il serait resté une bombe à
retardement.

**Restant à faire, côté utilisateur** : tâches 1 (SMTP Resend) et 7 (bascule
`ENABLE_EMAIL_AUTOCONFIRM=false`), puis vérification de bout en bout en
production. Le parcours est inerte tant que la tâche 1 n'est pas faite.
