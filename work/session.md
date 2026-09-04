# Sessions : durée en AFK, et partage web → extension

## Symptôme

Retour après une absence prolongée (navigateur fermé) → **écran de connexion**,
session perdue. Attente : rester connecté.

## Cause

Il n'y avait aucune durée à allonger. Une session Supabase n'expire pas : ni
`sessions.timebox` ni `sessions.inactivity_timeout` ne sont posés, et le refresh
token est perpétuel. Le coupable était la **rotation des refresh tokens**.

La rotation révoque toute la famille de jetons dès qu'un jeton déjà échangé est
représenté hors de sa fenêtre de tolérance (10 s). Or **l'app web et la PWA
installée partagent le même `localStorage`** : même origine, donc un seul jeton
pour deux contextes qui rafraîchissent chacun de leur côté. Un réveil de machine
suffit. Le refresh échoue, auth-js purge la session du stockage, et l'app
redémarre sur `SignIn` — exactement le symptôme observé.

## Décisions

**1. Rotation désactivée** (`enable_refresh_token_rotation = false`). C'est la
correction ; le reste en découle. Coût assumé : un refresh token volé reste
valide jusqu'à la déconnexion, faute de détection de rejeu.

**2. `jwt_expiry` laissé à 3600.** Contre-intuitif, et c'est le piège : PostgREST
valide un JWT hors ligne, sur sa seule signature. Sa durée est donc exactement la
fenêtre pendant laquelle une déconnexion globale reste sans effet. L'allonger
aurait échangé de la révocabilité réelle contre un gain nul sur le symptôme.

**3. Un 401 ne vaut plus déconnexion immédiate.** `persist.ts` (web) et
`store.ts` (extension) tentent un `refreshSession()` et rejouent l'écriture une
fois avant de conclure. Le cas fréquent est l'access token périmé pendant la
veille : auth-js le renouvelle bien, mais sur `visibilitychange`, et le premier
geste de l'utilisateur peut partir avant.

**4. Partage de session web → extension** par `externally_connectable` +
`chrome.runtime.sendMessage`, plutôt que par un content script. Le content script
aurait imposé un `host_permissions` — donc un avertissement à l'installation —
pour un gain limité : couvrir une session web déjà ouverte, ce que
`INITIAL_SESSION` couvre déjà à chaque chargement de l'app web.

Canal **unidirectionnel** : l'extension ne renvoie jamais sa session au web.

## Gotchas

- **La rotation et le partage sont liés.** Le partage fait vivre le même refresh
  token dans deux stockages (`localStorage` / `chrome.storage.local`) qui dérivent
  l'un de l'autre. Réactiver la rotation les ferait se révoquer mutuellement :
  c'est ce qui casserait en premier.

- **`config.toml` ne pilote que le local.** La production est un compose modifié à
  la main sur Coolify. Le réglage doit y être repris :
  `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=false` (cf. `coolify-deploy.md`).

- **`VITE_EXTENSION_ID` n'a pas de valeur par défaut possible.** L'ID d'une
  extension chargée localement dérive du *chemin* du dossier : il diffère d'une
  machine à l'autre et de celui du Store. Sans la variable, le partage est
  inactif — silencieusement, et c'est voulu.

- **Les match patterns n'ont pas de port.** `externally_connectable.matches`
  contient `http://localhost/*`, jamais `http://localhost:5173/*` (invalide, et
  un manifeste invalide empêche l'extension entière de se charger). Le port est
  reverrouillé au runtime par le contrôle d'origine, qui suit `VITE_WEB_APP_URL` :
  un build de production n'accepte donc pas un serveur local.

- **Deux contextes installent le même écouteur** (service worker + panneau), et
  appellent donc `setSession` avec les mêmes jetons quasi simultanément. C'est
  idempotent *parce que* la rotation est désactivée. Le panneau en a besoin : il
  peut être ouvert au moment de l'envoi, et son client auth-js est une instance
  distincte de celle du worker.

- **La déconnexion est propagée elle aussi.** Le `signOut` du web est en portée
  globale : il révoque les jetons de l'extension. Sans le message, elle
  s'afficherait connectée avec une session morte jusqu'à la première écriture.
