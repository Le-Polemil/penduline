/*
  Service worker volontairement vide de toute logique applicative.

  POURQUOI IL EXISTE — ne pas le supprimer comme code mort.
  Chrome n'affiche l'invite d'installation automatique (`beforeinstallprompt`) que si
  la page est contrôlée par un service worker qui écoute `fetch`. L'installation via
  le menu ⋮ ne l'exige plus depuis Chrome 108 (mobile) / 112 (desktop), mais l'invite
  si. Sans ce fichier, Penduline est installable et ne le propose jamais.

  POURQUOI IL NE MET RIEN EN CACHE.
  Mettre l'app shell en cache ferait cohabiter deux versions du bundle et rendrait un
  déploiement invisible aux onglets déjà ouverts — exactement ce que `nginx.conf`
  évite en interdisant la mise en cache d'`index.html`. Le mode hors-ligne est un
  sujet à part entière, pas un effet de bord de l'installabilité.

  Corollaire côté serveur : `nginx.conf` sert ce fichier en `no-cache`. Un service
  worker mis en cache longtemps est impossible à corriger à distance.
*/

// Un service worker est collant : sans ces deux lignes, une version corrigée de ce
// fichier resterait en attente derrière l'ancienne jusqu'à la fermeture de tous les
// onglets.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // Passe-plat, restreint aux navigations.
  //
  // `respondWith` plutôt qu'un corps vide : Chrome détecte les handlers `fetch`
  // no-op et les ignore, ce qui invaliderait le critère d'installabilité que ce
  // fichier existe précisément pour satisfaire.
  //
  // Restreint aux navigations plutôt qu'appliqué à tout : le trafic Supabase n'a
  // aucune raison de traverser le service worker et d'y payer un aller-retour.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  }
});
