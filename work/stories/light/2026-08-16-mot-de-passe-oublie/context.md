---
story: "Mot de passe oublié : parcours de récupération"
story_code: "mot-de-passe-oublie"
issue: 33
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Penduline ne permet pas de récupérer un compte dont le mot de passe est oublié. Les
écrans de connexion, web comme extension, n'offrent que « se connecter » et
« s'inscrire ». Un utilisateur qui perd son mot de passe perd donc son compte, ses
matrices et ses tâches — définitivement, et sans que le mainteneur puisse intervenir. Ce
n'est pas une fonctionnalité manquante parmi d'autres : c'est le seul manque du backlog
dont la conséquence est une perte de données irréversible pour l'utilisateur.

La valeur livrée est un parcours complet et autonome : depuis l'écran de connexion,
l'utilisateur demande un lien, le reçoit par e-mail, définit un nouveau mot de passe et
se retrouve connecté. Aucune intervention humaine, aucun canal de support.

Le périmètre couvre aussi la **confirmation d'adresse à l'inscription**. Les deux
parcours reposent sur exactement la même mécanique — envoi d'e-mail, lien de retour,
détection dans l'application — et les séparer reviendrait à construire deux fois la même
chose. Aujourd'hui l'inscription est auto-confirmée en production : n'importe quelle
adresse, même inventée, crée un compte fonctionnel. Or un mot de passe oublié sur une
adresse erronée redevient irrécupérable — les deux sujets se tiennent.

Critères d'acceptation principaux : demander une réinitialisation depuis la connexion ;
recevoir un e-mail dont le lien mène à l'écran de nouveau mot de passe ; l'ancien mot de
passe cesse de fonctionner ; un lien expiré ou déjà utilisé affiche un message clair ;
**aucune information n'est révélée sur l'existence d'un compte** ; l'extension renvoie
vers le parcours web sans le dupliquer.

## Vue architecturale

Trois composants entrent en jeu, et un seul est du code applicatif.

```
  Navigateur                GoTrue (auto-hébergé)          Resend
  ──────────                ─────────────────────          ──────
  SignIn
    └─ resetPasswordForEmail ──▶ POST /recover
                                    └─ rend le gabarit ──▶ envoi SMTP
                                                              │
                                                              ▼
                                                         boîte mail
                                                              │
  App (onAuthStateChange)  ◀── redirection #access_token ──────┘
    └─ PASSWORD_RECOVERY
         └─ NewPassword
              └─ updateUser({ password }) ──▶ PUT /user
```

**Décision structurante : aucun routeur n'est introduit.** L'application navigue par
`useState` dans `App.tsx`, sans bibliothèque de routage. La vérification de
`@supabase/auth-js` 2.110.8 installé montre que ce n'est pas un obstacle : le client est
en `flowType: 'implicit'` avec `detectSessionInUrl: true`, il consomme donc seul les
jetons présents dans le fragment d'URL et émet un événement `PASSWORD_RECOVERY` sur
`onAuthStateChange` — auquel `App.tsx` est **déjà** abonné. L'ajout se réduit à un état
`recovering` et une branche de rendu.

Ce choix a un effet secondaire favorable qu'un flux PKCE n'aurait pas offert : sans code
verifier à retrouver en stockage local, **le lien fonctionne depuis n'importe quel
navigateur ou appareil**. L'utilisateur peut demander la réinitialisation sur son
ordinateur et ouvrir le mail sur son téléphone.

Le piège à traiter est l'ordre de rendu : le lien de récupération **ouvre une session**.
Sans précaution, `session` devient non nul et l'application s'afficherait normalement,
sautant l'écran de changement de mot de passe. Le drapeau `recovering` doit donc primer
sur `session`.

**L'infrastructure est le vrai point dur.** La production est un Supabase auto-hébergé
sur Coolify, dégraissé à PostgREST + GoTrue, sans SMTP configuré — l'auto-confirmation
des inscriptions était un contournement de cette absence, documenté dans
`work/coolify-deploy.md:36`. Aucune ligne de code ne peut compenser cela : tant que
GoTrue ne sait pas envoyer d'e-mail, le parcours est inerte. La configuration SMTP
(Resend) est donc une tâche du plan, à exécuter côté Coolify, et non un préalable
implicite.

Impact sur l'existant : nul côté base de données (aucune migration), nul côté RLS,
contenu côté front (un seul fichier applicatif significativement modifié).

## Impacts UX

Le parcours ajoute deux écrans, tous deux greffés sur l'existant plutôt que créés à
part. La demande de réinitialisation devient un troisième `mode` du composant `SignIn`,
qui bascule déjà entre connexion et inscription — l'utilisateur reste dans le même cadre
visuel, et le code ne se dédouble pas.

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│         Penduline           │     │         Penduline           │
│  Connexion à ton compte     │     │  Réinitialiser le mot de    │
│                             │     │  passe                      │
│  Email    [_____________]   │     │                             │
│  Mot de passe [_________]   │ ──▶ │  Email    [_____________]   │
│                             │     │                             │
│      [  Se connecter  ]     │     │   [  Envoyer le lien  ]     │
│                             │     │                             │
│  Pas de compte ? Créer      │     │  ‹ Retour à la connexion    │
│  Mot de passe oublié ?      │     │                             │
└─────────────────────────────┘     └─────────────────────────────┘
```

Le message de confirmation est délibérément **imprécis** : « Si un compte existe pour
cette adresse, un lien vient d'être envoyé. » C'est une contrainte de sécurité, pas une
maladresse de rédaction — un message différencié permettrait de découvrir quelles
adresses ont un compte. Il en découle une tension assumée avec le principe général de
remonter les erreurs à l'utilisateur (#34) : ici, le silence est la fonctionnalité.

L'écran de nouveau mot de passe demande une saisie et sa confirmation, avec le même
minimum de 8 caractères que partout ailleurs. Une fois validé, l'utilisateur n'est pas
renvoyé vers la connexion : il est déjà authentifié, donc l'application s'ouvre
directement. Éviter une reconnexion superflue est ce qui fait la différence entre un
parcours de récupération et une corvée.

Sur l'extension, aucune duplication : un popup de 400 × 600 px n'est pas le lieu d'un
aller-retour par e-mail. Un simple lien ouvre le parcours web dans un onglet.

Accessibilité : les nouveaux champs reprennent les `<label>` et les types natifs déjà
utilisés dans le formulaire existant, les messages d'erreur restent liés à leur champ,
et le parcours est entièrement praticable au clavier.
