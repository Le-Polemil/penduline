import type { SupabaseClient } from '@supabase/supabase-js';
import type { Attachment, Board, Task, Universe } from './types';

/**
 * Ce que l'hôte confie au temps réel : de quoi fusionner, et de quoi repartir.
 *
 * Les collections sont écrites par des fonctions de mise à jour, jamais par des
 * valeurs : l'événement arrive de façon asynchrone, et l'état d'alors est le seul
 * qui compte.
 */
export interface RealtimeSink {
  setTasks: (fn: (ts: Task[]) => Task[]) => void;
  setBoards: (fn: (bs: Board[]) => Board[]) => void;
  setUniverses: (fn: (us: Universe[]) => Universe[]) => void;
  /**
   * Absent = la table n'est **pas abonnée** du tout.
   *
   * C'est ainsi que le panneau d'extension s'en passe : il ne porte pas les
   * liens. L'absence vaut configuration — pas de drapeau `mode`, la même
   * convention que les props facultatives de `TaskCard`.
   */
  setAttachments?: (fn: (as: Attachment[]) => Attachment[]) => void;
  /**
   * Une tâche a-t-elle sa place en mémoire ? Même règle que le chargement (#40).
   *
   * ⚠️ Reste chez l'HÔTE, et ne doit pas être mutualisée : le web garde les
   * étapes cochées, le panneau ne lit que `done = false` sans étapes. Une règle
   * commune ferait rentrer par le canal ce que le `select` du panneau écarte.
   */
  admits: (t: Task) => boolean;
  /** Rechargement complet, après une coupure. */
  reload: () => Promise<void>;
}

/** Options de l'abonnement. Tout y est facultatif. */
export interface RealtimeOptions {
  /**
   * Notifié à chaque bascule de l'état du canal. `true` = le flux est établi.
   *
   * Un booléen et non le statut brut : l'appelant n'a pas à connaître le
   * vocabulaire de supabase-js pour savoir s'il doit encore relire lui-même.
   */
  onLive?: (live: boolean) => void;
}

/** Deux lignes portent-elles la même chose ? Décide s'il faut re-rendre. */
export function identiques<T extends object>(a: T, b: T): boolean {
  const clefs = Object.keys(b) as (keyof T)[];
  return clefs.every((k) => a[k] === b[k]);
}

/**
 * Fusionne une ligne reçue dans une liste, sans re-rendre pour rien.
 *
 * ⚠️ C'est ici que l'écho de ses propres écritures est neutralisé — **par
 * comparaison, pas par marquage**. Suivre les identifiants qu'on vient d'écrire
 * supposerait de savoir quand les oublier : trop tôt on rate une modification
 * distante, trop tard on l'ignore. Comparer ne se trompe jamais.
 *
 * Rendre la MÊME référence quand rien ne change est ce qui évite le
 * scintillement : React ne re-rend pas un état identique. C'est aussi ce qui
 * garde texte ET focus dans un champ pendant qu'une écriture distante arrive.
 */
export function fusionner<T extends { id: string }>(liste: T[], recue: T): T[] {
  const i = liste.findIndex((x) => x.id === recue.id);
  if (i === -1) return [...liste, recue];
  if (identiques(liste[i], recue)) return liste;
  const copie = [...liste];
  copie[i] = recue;
  return copie;
}

export function retirer<T extends { id: string }>(liste: T[], id: string): T[] {
  const i = liste.findIndex((x) => x.id === id);
  return i === -1 ? liste : liste.filter((x) => x.id !== id);
}

/**
 * Abonne un client aux changements de la base et les applique via le `sink`.
 *
 * **Sans React, et sans savoir qui l'appelle** : l'app web et le panneau
 * d'extension y branchent chacun un `useEffect` de dix lignes. Le client
 * Supabase est INJECTÉ — le même parti que `createSupabase` dans ce paquet : ce
 * module ne fabrique aucun client et ne connaît ni l'environnement du web, ni
 * l'adaptateur `chrome.storage` du panneau.
 *
 * ⚠️ **`getSink` est une FONCTION, pas un objet.** Le sink est reconstruit à
 * chaque rendu de l'hôte : le capturer une fois figerait `reload` et `admits` au
 * premier, et le rechargement de reconnexion rappellerait éternellement une
 * fonction périmée. C'était déjà un des deux défauts trouvés dans le premier jet
 * de #39, évité là-bas par une ref tenue à jour *à l'intérieur* du hook. Le
 * prendre en paramètre rend le piège **inatteignable** au lieu de compter sur la
 * discipline de chaque appelant.
 *
 * ⚠️ **Aucun filtre serveur.** L'abonnement ne déclare pas
 * `user_id=eq.<moi>` — ce qu'il faisait jusqu'ici. Ce filtre n'a jamais été la
 * frontière de sécurité : la frontière est la RLS, que Realtime évalue **par
 * abonné et pour chaque événement**. C'était une simple économie de réveils, et
 * elle coûtait deux choses :
 *
 *   1. sous un partage de matrice (#53), une tâche porte le `user_id` de son
 *      propriétaire. La RLS dirait oui à l'invité, le filtre dirait non AVANT —
 *      et l'événement ne serait jamais livré. Sans erreur, sans log ;
 *   2. `tasks.user_id` change de sens avec #53 (« propriétaire » → « auteur ») :
 *      un client qui filtre là-dessus devient faux sans que rien ne le signale.
 *
 * C'est déjà le parti du dépôt : `search_tasks`, `review_boards` et
 * `completion_stats` sont toutes `security invoker` et n'ont AUCUN prédicat
 * `user_id` — elles reposent entièrement sur la RLS.
 *
 * Contrepartie assumée : le serveur évalue la RLS pour chaque abonné au lieu
 * d'écarter d'abord ceux dont le filtre ne correspond pas. À cette échelle
 * (auto-hébergé, poignée de comptes, aucun plafond Realtime dans `config.toml`)
 * c'est négligeable. Si le volume devenait un sujet, le levier serait un filtre
 * `board_id=in.(<matrices accessibles>)` — écarté ici, et pas par paresse :
 * `task_attachments` ne porte pas de `board_id`, il faudrait se réabonner à
 * chaque changement du jeu de matrices (avec une fenêtre d'événements perdus à
 * chaque fois), et ça remettrait dans le client une décision d'accès que #53 va
 * justement en sortir.
 *
 * ⚠️ Suppose la migration `20260829140000_realtime.sql`. Sans elle, la
 * publication est vide : l'abonnement se connecte et ne reçoit RIEN — aucune
 * erreur, juste le silence.
 *
 * @returns la fonction de désabonnement.
 */
export function subscribeRealtime(
  client: SupabaseClient,
  userId: string,
  getSink: () => RealtimeSink,
  options: RealtimeOptions = {},
): () => void {
  /**
   * A-t-on déjà été abonné une fois ?
   *
   * `SUBSCRIBED` arrive aussi bien à la première connexion qu'après une
   * reconnexion. Seule la seconde justifie un rechargement — recharger à la
   * première doublerait le chargement initial.
   */
  let dejaAbonne = false;

  // Une seule connexion pour toutes les tables — un canal par table
  // multiplierait les WebSockets sans rien apporter.
  const canal = client.channel(`penduline:${userId}`);

  canal
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (msg) => {
      const sink = getSink();
      if (msg.eventType === 'DELETE') {
        // La ligne supprimée arrive entière grâce à `replica identity full` —
        // sans elle, la RLS n'aurait rien à évaluer et l'événement ne serait
        // même pas délivré.
        const id = (msg.old as Partial<Task>).id;
        if (id) sink.setTasks((ts) => retirer(ts, id));
        return;
      }
      const t = msg.new as Task;
      sink.setTasks((ts) => {
        // On ne fait entrer que ce qu'on garderait au chargement : sinon le
        // temps réel réintroduirait par la fenêtre les archives que #40 a
        // sorties par la porte. Une ligne DÉJÀ connue reste suivie, elle —
        // c'est ce qui permet de voir une tâche se faire cocher à distance.
        const connue = ts.some((x) => x.id === t.id);
        if (!connue && !sink.admits(t)) return ts;
        return fusionner(ts, t);
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, (msg) => {
      const sink = getSink();
      if (msg.eventType === 'DELETE') {
        const id = (msg.old as Partial<Board>).id;
        if (id) {
          sink.setBoards((bs) => retirer(bs, id));
          // `on delete cascade` emporte les tâches côté base, mais aucun
          // événement ne le dit : sans ce nettoyage, elles resteraient en
          // mémoire, rattachées à une matrice disparue.
          sink.setTasks((ts) => ts.filter((t) => t.board_id !== id));
        }
        return;
      }
      sink.setBoards((bs) => fusionner(bs, msg.new as Board));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'universes' }, (msg) => {
      const sink = getSink();
      if (msg.eventType === 'DELETE') {
        const id = (msg.old as Partial<Universe>).id;
        if (id) sink.setUniverses((us) => retirer(us, id));
        return;
      }
      sink.setUniverses((us) => fusionner(us, msg.new as Universe));
    });

  // Les pièces jointes suivent la même règle que le reste (#78) : sans ça, un
  // lien ajouté dans un onglet n'apparaîtrait dans l'autre qu'au rechargement.
  // Pas de `admits` ici — un lien appartient à sa tâche, et c'est la présence de
  // la TÂCHE qui décide de ce qu'on affiche.
  //
  // Abonnée seulement si l'hôte sait quoi en faire : le panneau ne porte pas les
  // liens, et ouvrir cette écoute pour lui ne ferait que du trafic inutile.
  if (getSink().setAttachments) {
    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'task_attachments' },
      (msg) => {
        const set = getSink().setAttachments;
        if (!set) return;
        if (msg.eventType === 'DELETE') {
          const id = (msg.old as Partial<Attachment>).id;
          return void (id && set((as) => retirer(as, id)));
        }
        set((as) => fusionner(as, msg.new as Attachment));
      },
    );
  }

  canal.subscribe((statut) => {
    options.onLive?.(statut === 'SUBSCRIBED');
    // Pendant une coupure, les événements sont perdus : les rejouer est
    // impossible, donc on repart de la vérité. C'est aussi ce qui rattrape une
    // mise en veille de l'appareil.
    if (statut !== 'SUBSCRIBED') return;
    if (dejaAbonne) void getSink().reload();
    dejaAbonne = true;
  });

  return () => {
    void client.removeChannel(canal);
  };
}
