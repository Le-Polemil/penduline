import type { SupabaseClient } from '@supabase/supabase-js';
import type { Attachment, Board, BoardPlacement, Task, Universe } from './types';

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
   * Les rangements personnels (#53). Même convention : absent = non abonné.
   *
   * ⚠️ Ce n'est pas une table comme les autres — voir l'avertissement sur le
   * réabonnement plus bas. C'est elle qui dit qu'une matrice partagée vient
   * d'arriver ou de partir.
   */
  setPlacements?: (fn: (ps: BoardPlacement[]) => BoardPlacement[]) => void;
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
  /**
   * Recharger DÈS que l'abonnement aboutit, sans attendre une reconnexion (#53).
   *
   * À poser quand cet abonnement en REMPLACE un autre — jeu de matrices
   * accessibles modifié. Entre l'arrêt de l'ancien et l'établissement du
   * nouveau, les événements sont perdus et Realtime ne rejoue rien : seul un
   * rechargement complet referme cette fenêtre.
   *
   * Laissé à `false` au tout premier abonnement, où il doublerait le chargement
   * initial.
   */
  rechargerDesLAbonnement?: boolean;
}

/**
 * ⚠️ **Realtime plafonne un filtre `in` à 100 valeurs.**
 *
 * Mesuré dans le source de `realtime.subscription_check_filters` : au-delà, la
 * fonction LÈVE (`too many values for \`in\` filter. Maximum 100`) et
 * l'abonnement échoue **en entier** — pas seulement pour les matrices en trop.
 * Le mode de défaillance est donc total, et silencieux côté application.
 *
 * D'où le découpage. Un compte réel a une poignée de matrices ; ce seuil ne se
 * traite pas « quand on le franchira », parce que le jour où on le franchit,
 * plus rien ne se synchronise.
 */
export const MAX_FILTRE_IN = 100;

/** Découpe une liste en tranches d'au plus `taille` éléments. */
export function tranches<T>(liste: T[], taille = MAX_FILTRE_IN): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille));
  return out;
}

/**
 * Deux jeux de matrices désignent-ils la même chose ?
 *
 * L'ORDRE NE COMPTE PAS : `load` trie par position, et déplacer une matrice
 * dans un univers change cet ordre sans rien changer à l'accès. Comparer les
 * listes telles quelles ferait rouvrir un WebSocket à chaque glisser-déposer —
 * et, pire, déclencherait à chaque fois le rechargement complet qui suit un
 * réabonnement.
 */
export function memeJeu(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const vus = new Set(a);
  return b.every((x) => vus.has(x));
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
 * Même travail que `fusionner`, pour une table à clé COMPOSÉE.
 *
 * `board_placements` n'a pas d'`id` : sa clé est `(board_id, user_id)`. Comme
 * l'abonnement est filtré sur `user_id=eq.<moi>`, `board_id` suffit à
 * l'identifier ici — mais le type n'a pas de champ `id`, et `fusionner` ne
 * s'applique donc pas.
 */
export function fusionnerPlacement(
  liste: BoardPlacement[],
  recu: BoardPlacement,
): BoardPlacement[] {
  const i = liste.findIndex((x) => x.board_id === recu.board_id);
  if (i === -1) return [...liste, recu];
  if (identiques(liste[i], recu)) return liste;
  const copie = [...liste];
  copie[i] = recu;
  return copie;
}

export function retirerPlacement(liste: BoardPlacement[], boardId: string): BoardPlacement[] {
  const i = liste.findIndex((x) => x.board_id === boardId);
  return i === -1 ? liste : liste.filter((x) => x.board_id !== boardId);
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
 * ── LE FILTRE SERVEUR, ET POURQUOI IL A CHANGÉ DE FORME SANS DISPARAÎTRE ─────
 *
 * ⚠️ **LE FILTRE SERVEUR EST LA SEULE BARRIÈRE DES ÉVÉNEMENTS `DELETE`.**
 * Ne pas le retirer. Mesuré contre un Supabase réel le 2026-09-08, puis
 * CONFIRMÉ DANS LE SOURCE de `realtime.apply_rls` le 2026-09-22 :
 *
 * | Événement | Ce qui décide de la délivrance |
 * |---|---|
 * | INSERT / UPDATE | la RLS — le filtre y est bien redondant |
 * | **DELETE** | **le filtre SEUL** — la RLS n'y est PAS appliquée |
 *
 * Le protocole exact : Realtime évalue le filtre contre la ligne ENTIÈRE (il
 * l'a, grâce à `replica identity full`), puis **caviarde** la charge utile à la
 * seule clé primaire. Mais `apply_rls` porte littéralement
 * `if is_rls_enabled and action <> 'DELETE'` : aucune policy n'est évaluée pour
 * les suppressions, et passer le filtre suffit à être délivré.
 *
 * Jusqu'à #53 ce filtre était `user_id=eq.<moi>`. Le partage l'a rendu FAUX —
 * une tâche d'une matrice partagée n'est pas la mienne — sans pour autant
 * permettre de le supprimer, ce qui donnerait à tout compte authentifié
 * l'identifiant de chaque suppression de la base. Il est donc devenu
 * **conforme à l'accès** :
 *
 *     tasks, task_attachments   board_id=in.(<matrices accessibles>)
 *     boards                    id=in.(<les mêmes>)
 *     universes, placements     user_id=eq.<moi>          (mono-utilisateur)
 *
 * `check_equality_op` traduit `in` en `= any(…)` : c'est le MÊME chemin de code
 * que `eq`, donc la propriété vérifiée en septembre tient telle quelle.
 *
 * ── LE RÉABONNEMENT, ET SON PRIX ────────────────────────────────────────────
 *
 * Le prix de ce filtre, c'est qu'il est un **instantané client d'une vérité
 * serveur** : il périme dès qu'une adhésion bouge. L'hôte doit donc rappeler
 * cette fonction avec le nouveau jeu — et le signal qui le lui apprend arrive
 * par `board_placements`, dont le filtre `user_id=eq.<moi>`, lui, ne périme
 * jamais :
 *
 *     partage accordé  → INSERT du placement → délivré, tout de suite
 *     partage révoqué  → DELETE du placement → délivré, tout de suite
 *
 * Entre l'ancien abonnement et le nouveau, les événements sont PERDUS et
 * Realtime ne rejoue rien. D'où `rechargerDesLAbonnement` : le réabonnement
 * doit être suivi d'un rechargement complet, exactement comme la reconnexion.
 *
 * ⚠️ Suppose la migration `20260829140000_realtime.sql` et celles de #53. Sans
 * elles, la publication est vide : l'abonnement se connecte et ne reçoit RIEN —
 * aucune erreur, juste le silence.
 *
 * @param boardIds les matrices ACCESSIBLES au moment de l'abonnement. Un jeu
 *   vide n'abonne aucune table scopée — `in.()` n'est pas un filtre valable, et
 *   ce cas existe vraiment : un compte neuf, une seconde avant son premier
 *   chargement.
 * @returns la fonction de désabonnement.
 */
export function subscribeRealtime(
  client: SupabaseClient,
  userId: string,
  boardIds: string[],
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

  const mien = `user_id=eq.${userId}`;
  /**
   * Un nom UNIQUE par abonnement. Un réabonnement ouvre un canal pendant que
   * l'ancien se ferme : réutiliser le même nom les ferait se marcher dessus, et
   * supabase-js rendrait le canal existant au lieu d'en créer un neuf.
   */
  const canal = client.channel(`penduline:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);

  // ── Les tables scopées à l'accès ──────────────────────────────────────────
  // Une liaison par tranche de 100 : au-delà, l'abonnement entier échouerait.
  for (const lot of tranches(boardIds)) {
    const parMatrice = `board_id=in.(${lot.join(',')})`;

    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: parMatrice },
      (msg) => {
        const sink = getSink();
        if (msg.eventType === 'DELETE') {
          // La ligne supprimée arrive entière grâce à `replica identity full` —
          // sans elle, le filtre n'aurait rien à évaluer et l'événement ne
          // serait même pas délivré.
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
      },
    );

    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'boards', filter: `id=in.(${lot.join(',')})` },
      (msg) => {
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
      },
    );

    // Les pièces jointes suivent la même règle que le reste (#78) : sans ça, un
    // lien ajouté dans un onglet n'apparaîtrait dans l'autre qu'au rechargement.
    // Pas de `admits` ici — un lien appartient à sa tâche, et c'est la présence
    // de la TÂCHE qui décide de ce qu'on affiche.
    //
    // Abonnée seulement si l'hôte sait quoi en faire : le panneau ne porte pas
    // les liens, et ouvrir cette écoute pour lui ne ferait que du trafic inutile.
    if (getSink().setAttachments) {
      canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_attachments', filter: parMatrice },
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
  }

  // ── Les tables mono-utilisateur ───────────────────────────────────────────
  // Leur filtre ne périme jamais : il ne dépend pas du jeu de matrices.
  canal.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'universes', filter: mien },
    (msg) => {
      const sink = getSink();
      if (msg.eventType === 'DELETE') {
        const id = (msg.old as Partial<Universe>).id;
        if (id) sink.setUniverses((us) => retirer(us, id));
        return;
      }
      sink.setUniverses((us) => fusionner(us, msg.new as Universe));
    },
  );

  // ⚠️ LA TABLE QUI PORTE LE SIGNAL DU PARTAGE (#53).
  //
  // C'est en voyant passer un placement qu'on apprend qu'une matrice vient de
  // s'ouvrir ou de se fermer — et donc qu'il faut se réabonner avec un autre
  // jeu. L'hôte n'a rien à orchestrer : il recalcule son jeu depuis ses
  // placements, et le changement de jeu relance cette fonction.
  if (getSink().setPlacements) {
    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'board_placements', filter: mien },
      (msg) => {
        const set = getSink().setPlacements;
        if (!set) return;
        if (msg.eventType === 'DELETE') {
          // Charge utile caviardée à la clé primaire — ici `(board_id, user_id)`,
          // ce qui suffit amplement : on sait quelle matrice s'en va.
          const boardId = (msg.old as Partial<BoardPlacement>).board_id;
          return void (boardId && set((ps) => retirerPlacement(ps, boardId)));
        }
        set((ps) => fusionnerPlacement(ps, msg.new as BoardPlacement));
      },
    );
  }

  canal.subscribe((statut) => {
    options.onLive?.(statut === 'SUBSCRIBED');
    // Pendant une coupure, les événements sont perdus : les rejouer est
    // impossible, donc on repart de la vérité. C'est aussi ce qui rattrape une
    // mise en veille de l'appareil — et, depuis #53, la fenêtre ouverte par un
    // réabonnement sur un jeu de matrices modifié.
    if (statut !== 'SUBSCRIBED') return;
    if (dejaAbonne || options.rechargerDesLAbonnement) void getSink().reload();
    dejaAbonne = true;
  });

  return () => {
    void client.removeChannel(canal);
  };
}
