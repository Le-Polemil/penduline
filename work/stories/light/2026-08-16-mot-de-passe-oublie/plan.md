---
story: "Mot de passe oublié : parcours de récupération"
story_code: "mot-de-passe-oublie"
issue: 33
created: 2026-08-16
status: "In Progress"
---

# #33 — Mot de passe oublié : parcours de récupération

## Contexte

Le dépôt n'a **aucun parcours de récupération de mot de passe** — zéro occurrence de
`resetPasswordForEmail`. Les deux écrans de connexion (`apps/web/src/App.tsx:59`,
`apps/extension/src/App.tsx:415`) ne proposent que « se connecter » et « s'inscrire ».
Un utilisateur qui oublie son mot de passe **perd son compte définitivement**, sans
recours et sans que le mainteneur puisse l'aider. C'est le seul ticket du backlog dont
l'absence détruit des données utilisateur.

### Ce que l'exploration a mis au jour

La production n'est **pas** un projet supabase.com : c'est un **Supabase auto-hébergé**
sur Coolify (`https://api.penduline.polemil.dev`), dégraissé à PostgREST + GoTrue.
Son endpoint public annonce `"mailer_autoconfirm": true`.

`work/coolify-deploy.md:36` explique pourquoi :

> `ENABLE_EMAIL_AUTOCONFIRM=false` **sans SMTP configuré** : `signUp()` crée un
> utilisateur jamais confirmé, donc impossible à connecter. Passé à `true`.

**Aucun SMTP n'est configuré.** L'autoconfirm n'était pas un choix produit, c'était un
contournement. `resetPasswordForEmail()` n'enverrait donc rien : configurer SMTP n'est
pas une tâche annexe de ce ticket, c'en est le prérequis. Fournisseur retenu : **Resend**.

La confirmation d'e-mail à l'inscription entre dans le périmètre : les deux parcours
partagent le SMTP, les gabarits, la liste d'URL autorisées et la détection de retour.

### Décision d'architecture : pas de routeur

L'app n'a pas de routeur (navigation par `useState` dans `App.tsx`). Ce n'est pas un
obstacle. Vérifié dans `@supabase/auth-js` 2.110.8 installé :

- `flowType: 'implicit'` par défaut (`GoTrueClient.js:24`) → le lien de récupération
  porte les jetons dans le **fragment d'URL**, pas en PKCE ;
- `detectSessionInUrl: true` par défaut (`GoTrueClient.js:22`) → le client les consomme
  seul ;
- il émet alors `PASSWORD_RECOVERY` via `onAuthStateChange` (`GoTrueClient.js:2021`).

**Conséquence favorable** : sans code verifier PKCE à retrouver en stockage local, le
lien marche depuis **n'importe quel navigateur ou appareil** — l'utilisateur peut ouvrir
son mail sur son téléphone. Un flux PKCE aurait imposé le même navigateur.

`App.tsx:17` s'abonne **déjà** à `onAuthStateChange` : il suffit d'y capter l'événement.

> ⚠️ **Piège à traiter** : le lien de récupération **ouvre une session**. `session`
> devient non nul et le code actuel afficherait l'app normalement. Il faut un drapeau
> `recovering` qui prend le pas sur `session` dans le rendu.

---

## Tâches

### 1. Prérequis — configurer SMTP Resend sur GoTrue *(exécuté par l'utilisateur)*

Non exécutable de mon côté : pas d'accès au Coolify. Variables à ajouter au service
`supabase-auth`, en respectant la convention **sans préfixe** déjà en place dans ta
configuration (`ENABLE_EMAIL_AUTOCONFIRM`, `API_EXTERNAL_URL`…), que le compose mappe
vers les `GOTRUE_*` :

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<clé API Resend>
SMTP_ADMIN_EMAIL=penduline@polemil.dev
SMTP_SENDER_NAME=Penduline
```

Prérequis Resend : vérifier le domaine `polemil.dev` (enregistrements DNS SPF + DKIM),
que tu contrôles déjà.

Vérifier aussi que `GOTRUE_URI_ALLOW_LIST` contient `https://penduline.polemil.dev`,
sinon GoTrue refusera le `redirectTo`.

**Ne pas encore toucher à `ENABLE_EMAIL_AUTOCONFIRM`** — c'est la tâche 7, une fois le
parcours vérifié.

### 2. Gabarits d'e-mail en français

Deux fichiers HTML statiques versionnés dans le dépôt, servis par l'app web comme l'est
déjà `/confidentialite/` :

- `apps/web/public/emails/recovery.html`
- `apps/web/public/emails/confirmation.html`

Sobres, aux couleurs du produit (`--color-bg: #f5ead8`, `--color-accent: #c67139`),
avec le jeton `{{ .ConfirmationURL }}`. Puis pointer GoTrue dessus *(côté Coolify)* :

```
MAILER_SUBJECTS_RECOVERY=Réinitialiser votre mot de passe Penduline
MAILER_TEMPLATES_RECOVERY=https://penduline.polemil.dev/emails/recovery.html
MAILER_SUBJECTS_CONFIRMATION=Confirmez votre adresse — Penduline
MAILER_TEMPLATES_CONFIRMATION=https://penduline.polemil.dev/emails/confirmation.html
```

> Ces quatre variables ne figurent pas dans le compose Supabase standard : il faudra les
> ajouter au passage d'environnement du service `auth`. C'est le seul point qui touche
> au compose, déjà modifié par le dégraissage.

### 3. Web — écran « Mot de passe oublié »

Dans `apps/web/src/App.tsx`, étendre le composant `SignIn` d'un troisième `mode`
(`signin` | `signup` | `forgot`), plutôt que d'ajouter un écran séparé : le composant
gère déjà une bascule de mode, et l'ajout reste homogène.

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: window.location.origin,
})
```

**Règle anti-énumération** : afficher **toujours** le même message de confirmation
(« Si un compte existe pour cette adresse, un lien vient d'être envoyé »), que l'adresse
existe ou non, et **sans** distinguer le cas d'erreur « utilisateur inconnu ».

> Tension assumée avec #34 (remonter les échecs d'écriture) : ici le silence est la
> mesure de sécurité. Les vraies erreurs (réseau, quota) partent en `console.error`
> sans être différenciées à l'écran. À signaler dans #34 pour que la règle générale y
> prévoie cette exception.

### 4. Web — écran « Nouveau mot de passe »

- Dans `App()`, ajouter un état `recovering`, mis à `true` quand `onAuthStateChange`
  émet `PASSWORD_RECOVERY` (l'abonnement de `App.tsx:17` existe déjà).
- Ce drapeau **prime sur `session`** dans le rendu : `if (recovering) return <NewPassword/>`
  **avant** le `if (!session) return <SignIn/>`.
- `NewPassword` : deux champs (mot de passe + confirmation), `minLength={8}` cohérent
  avec l'existant et avec `minimum_password_length = 8` du `config.toml`.
- `await supabase.auth.updateUser({ password })`, puis `setRecovering(false)` → l'app
  s'affiche, l'utilisateur est connecté avec son nouveau mot de passe.
- Gérer le lien expiré ou déjà consommé : GoTrue redirige alors avec une erreur dans le
  fragment (`error_description`) — la lire et afficher un message clair avec un moyen de
  redemander un lien.
- Nettoyer le fragment d'URL après traitement (`history.replaceState`), pour qu'un jeton
  ne traîne pas dans la barre d'adresse ni dans l'historique.

### 5. Web — inscription avec confirmation d'e-mail

Aujourd'hui `signUp()` réussit et **rien ne se passe visiblement** si aucune session
n'est ouverte. Avec la confirmation activée (tâche 7), ce sera le cas systématique :
l'écran deviendrait un cul-de-sac.

Après `signUp()`, si `data.session` est nul, afficher un message « Vérifie ta boîte
mail pour confirmer ton adresse », au lieu de retomber muet sur le formulaire.

### 6. Extension — renvoyer vers le parcours web

Pas de duplication : un popup de 400 px n'est pas le lieu d'un aller-retour par e-mail.
Dans `apps/extension/src/App.tsx`, sous le formulaire `SignIn`, un lien « Mot de passe
oublié ? » ouvrant `WEB_APP_URL` (constante déjà définie `App.tsx:20`) dans un onglet.

### 7. Bascule de la confirmation d'e-mail *(exécuté par l'utilisateur)*

**Seulement après vérification bout en bout des tâches 1 à 5** : passer
`ENABLE_EMAIL_AUTOCONFIRM=false` dans Coolify.

Les comptes existants ont tous été créés en autoconfirm : ils restent confirmés et
connectables. Aucune migration n'est nécessaire.

### 8. Documentation

- `work/coolify-deploy.md` : le gotcha de la ligne 36 n'est plus un contournement subi —
  consigner la configuration SMTP retenue et la bascule de l'autoconfirm.
- `apps/supabase/config.toml` : aligner le local sur la prod pour que le parcours soit
  testable (`enable_confirmations`, et vérifier `additional_redirect_urls`).
- `work/stories/light/2026-08-16-mot-de-passe-oublie/dev.md` : journal tenu à chaque
  action, conformément au processus story light.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `apps/web/src/App.tsx` | Cœur du lot : mode `forgot`, écran `NewPassword`, état `recovering`, message d'inscription |
| `apps/web/src/styles.css` | Styles des nouveaux écrans, sur les classes `auth-*` existantes |
| `apps/web/public/emails/recovery.html` | Nouveau — gabarit e-mail |
| `apps/web/public/emails/confirmation.html` | Nouveau — gabarit e-mail |
| `apps/extension/src/App.tsx` | Lien vers le parcours web |
| `apps/extension/src/styles.css` | Style du lien |
| `apps/supabase/config.toml` | Alignement du local |
| `work/coolify-deploy.md` | Décision SMTP consignée |

Aucune migration SQL : le ticket ne touche qu'à GoTrue et au front.

---

## Vérifications

### Automatiques

```bash
npm run typecheck      # seule commande qualité du dépôt — ni lint ni tests
npm run build
```

### Plan de test manuel

**En local** (Supabase local, Inbucket capture les mails sur `http://127.0.0.1:54324`) :

1. Demander une réinitialisation → le mail arrive dans Inbucket
2. Cliquer le lien → l'écran « Nouveau mot de passe » s'affiche, **pas** l'app
3. Définir un mot de passe → l'app s'affiche, l'utilisateur est connecté
4. Se déconnecter, se reconnecter avec le **nouveau** mot de passe → OK
5. Se reconnecter avec l'**ancien** → refusé
6. Réutiliser le même lien une seconde fois → message d'expiration clair
7. Demander une réinitialisation sur une adresse **inexistante** → message strictement
   identique à l'étape 1, aucune fuite
8. Vérifier que le fragment d'URL ne contient plus de jeton après traitement
9. Extension : le lien « Mot de passe oublié ? » ouvre bien l'app web

**En production**, après la tâche 1 :

10. Réinitialisation de bout en bout sur une vraie adresse
11. Ouvrir le lien **depuis un autre navigateur** que celui de la demande → doit
    fonctionner (c'est ce que garantit le flux implicite)
12. Après la tâche 7 : créer un compte de test → mail de confirmation reçu, message
    « vérifie ta boîte mail » affiché, compte inutilisable avant confirmation

### Livraison

Branche `story-light/mot-de-passe-oublie` depuis `main`, PR assignée à `@me`,
`Closes #33`.

---

## Hors périmètre, à traiter après

Le dégraissage du compose a **retiré les Edge Functions** (`coolify-deploy.md:81`). Or
#36 (suppression de compte RGPD) et #25 (point d'entrée HTTP) reposent tous deux sur une
Edge Function dans leur rédaction actuelle. Ces deux tickets sont à réécrire — signalé
ici, hors périmètre de cette story.
