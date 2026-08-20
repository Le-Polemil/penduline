/**
 * Le relais entre « une écriture a échoué faute de session » et l'écran de
 * connexion.
 *
 * Il faut un relais parce que le toast d'échec ne survit pas à l'événement
 * qu'il annonce : signaler la session expirée fait retomber `App` sur `SignIn`
 * en quelques millisecondes, et l'hôte de toasts est démonté avec le reste.
 * Sans ce message repris de l'autre côté, l'utilisateur se retrouve devant un
 * écran de connexion sans savoir pourquoi.
 *
 * `sessionStorage` pour la même raison que la vue : c'est un état d'onglet.
 */
const KEY = 'penduline:session-notice';

export function setSessionNotice(message: string): void {
  try {
    window.sessionStorage.setItem(KEY, message);
  } catch {
    // Voir `readView` : un stockage indisponible ne doit rien casser.
  }
}

/**
 * Lit le message, sans l'effacer.
 *
 * ⚠️ Volontairement PURE, comme `readAuthHash` : elle sert d'initialiseur à
 * `useState`, que StrictMode invoque deux fois en développement. Une lecture
 * destructive y perdrait le message au second appel. L'effacement vit donc dans
 * `clearSessionNotice`, appelé depuis un effet.
 */
export function readSessionNotice(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Efface le message, pour qu'il ne se rejoue pas au rechargement suivant. */
export function clearSessionNotice(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Idem.
  }
}
