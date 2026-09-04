/**
 * L'app web que cette extension accompagne.
 *
 * Extrait d'`App.tsx` quand le service worker en a eu besoin à son tour : il
 * s'en sert comme d'un contrôle d'origine (voir `background.ts`), et cette
 * vérification n'a de valeur que si les deux fichiers désignent EXACTEMENT la
 * même app. Deux constantes recopiées auraient fini par diverger, et la
 * divergence aurait été muette.
 */

/** Surchargée au build par `VITE_WEB_APP_URL` (`.env` racine) ; le défaut reste
 * le serveur de dev, pour ne pas casser le local. */
export const WEB_APP_URL =
  (import.meta.env.VITE_WEB_APP_URL as string | undefined) ?? 'http://localhost:5173';

/**
 * L'origine seule — ce que `sender.origin` porte : un schéma, un hôte, un port,
 * et jamais de chemin ni de barre finale.
 *
 * `URL` plutôt qu'un découpage de chaîne : c'est une comparaison de sécurité, et
 * une normalisation approximative y serait exactement le genre d'écart qu'on
 * cherche à éviter. Le repli sur une chaîne vide ne peut correspondre à aucun
 * `sender.origin` réel — une URL mal formée dans `.env` ferme le canal au lieu
 * de l'ouvrir en grand.
 */
export const WEB_APP_ORIGIN = (() => {
  try {
    return new URL(WEB_APP_URL).origin;
  } catch {
    return '';
  }
})();
