import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Le service worker ne sert qu'à rendre l'app installable — il ne met rien en cache.
// Voir l'en-tête de `public/sw.js`.
//
// Prod uniquement : en dev, un service worker s'interpose entre Vite et la page et
// perturbe le HMR. `load` plutôt qu'immédiatement, pour ne pas disputer la bande
// passante au premier rendu.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Échec silencieux assumé : ne pas pouvoir s'installer n'est pas une raison de
    // faire du bruit dans la console d'une app qui, elle, fonctionne.
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
