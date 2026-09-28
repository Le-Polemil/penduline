/**
 * Le battement de cœur du temps réel, sorti du fil principal.
 *
 * ── POURQUOI CE FICHIER EXISTE ───────────────────────────────────────────────
 *
 * Realtime garde sa connexion ouverte grâce à un battement périodique. Par
 * défaut, supabase-js le tient avec un `setInterval` DANS LA PAGE — et les
 * navigateurs brident lourdement les minuteurs d'un document en arrière-plan.
 *
 * Le battement s'espace donc, puis cesse. Le serveur ferme la connexion de son
 * côté, et le client ne s'en aperçoit pas : c'est précisément le minuteur qui
 * devait le détecter. L'abonnement reste alors « établi » du point de vue du
 * client, et ne délivre plus rien. C'était le bug du panneau d'extension laissé
 * ouvert des heures sur un poste au repos.
 *
 * Un Web Worker n'est pas soumis au même bridage : son minuteur continue de
 * battre, la bibliothèque détecte la coupure et se reconnecte d'elle-même.
 *
 * ── POURQUOI UN FICHIER, ET PAS LE WORKER PAR DÉFAUT ─────────────────────────
 *
 * supabase-js sait fabriquer ce worker tout seul, à partir d'un `blob:`. On ne
 * s'en sert pas : dans une extension MV3, `blob:` relève de `script-src`, qui
 * vaut `'self'` — et le comportement a varié selon les versions de Chrome. Un
 * fichier servi par la même origine ne pose aucune question, ni ici ni là-bas.
 *
 * ⚠️ Ce fichier est DUPLIQUÉ dans `apps/extension/public/`. Les deux doivent
 * rester identiques. Ils ne peuvent pas être partagés : chaque application sert
 * ses propres ressources statiques, et un worker doit venir de l'origine de la
 * page qui l'ouvre.
 *
 * Le contrat vient de supabase-js (`RealtimeClient._startWorkerHeartbeat`) :
 * il poste `{ event: 'start', interval }`, et attend `{ event: 'keepAlive' }`
 * à chaque battement.
 */
addEventListener('message', (e) => {
  if (e.data.event === 'start') {
    setInterval(() => postMessage({ event: 'keepAlive' }), e.data.interval);
  }
});
