import { useEffect, useRef } from 'react';
import type { Attachment, Board, Task, Universe } from '@penduline/shared';
import { supabase } from '../lib/supabase';

/** Ce que le store confie au temps réel : de quoi fusionner, et de quoi repartir. */
export interface RealtimeSink {
  setTasks: (fn: (ts: Task[]) => Task[]) => void;
  setBoards: (fn: (bs: Board[]) => Board[]) => void;
  setUniverses: (fn: (us: Universe[]) => Universe[]) => void;
  setAttachments: (fn: (as: Attachment[]) => Attachment[]) => void;
  /** Une tâche a-t-elle sa place en mémoire ? Même règle que le chargement (#40). */
  admits: (t: Task) => boolean;
  /** Rechargement complet, après une coupure. */
  reload: () => Promise<void>;
}

/** Deux lignes portent-elles la même chose ? Décide s'il faut re-rendre. */
function identiques<T extends object>(a: T, b: T): boolean {
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
 * scintillement : React ne re-rend pas un état identique.
 */
function fusionner<T extends { id: string }>(liste: T[], recue: T): T[] {
  const i = liste.findIndex((x) => x.id === recue.id);
  if (i === -1) return [...liste, recue];
  if (identiques(liste[i], recue)) return liste;
  const copie = [...liste];
  copie[i] = recue;
  return copie;
}

function retirer<T extends { id: string }>(liste: T[], id: string): T[] {
  const i = liste.findIndex((x) => x.id === id);
  return i === -1 ? liste : liste.filter((x) => x.id !== id);
}

/**
 * Écoute les changements de la base et les applique à l'état local.
 *
 * Le store chargeait une seule fois au montage : deux onglets, ou le web et
 * l'extension, divergeaient en silence, et la dernière écriture écrasait l'autre
 * sans que personne ne le voie (#39).
 *
 * ⚠️ Ce hook suppose la migration `20260829140000_realtime.sql`. Sans elle, la
 * publication est vide : l'abonnement se connecte et ne reçoit RIEN — aucune
 * erreur, juste le silence.
 */
export function useRealtime(userId: string, sink: RealtimeSink) {
  // `sink` est reconstruit à chaque rendu du store. Le capturer dans l'effet le
  // figerait au premier : les rappels liraient éternellement le `reload` et le
  // `admits` d'alors. Une ref tenue à jour donne toujours le dernier.
  const courant = useRef(sink);
  courant.current = sink;

  /**
   * A-t-on déjà été abonné une fois ?
   *
   * `SUBSCRIBED` arrive aussi bien à la première connexion qu'après une
   * reconnexion. Seule la seconde justifie un rechargement — recharger à la
   * première doublerait le chargement initial.
   */
  const dejaAbonne = useRef(false);

  useEffect(() => {
    // Le filtre serveur double la RLS : inutile de réveiller le client pour des
    // lignes qu'il n'aurait pas le droit de lire de toute façon.
    const filtre = `user_id=eq.${userId}`;
    // Une seule connexion pour les trois tables — un canal par table
    // multiplierait les WebSockets sans rien apporter.
    const canal = supabase.channel(`penduline:${userId}`);

    canal
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: filtre }, (msg) => {
        if (msg.eventType === 'DELETE') {
          // La ligne supprimée arrive entière grâce à `replica identity full` —
          // sans elle, la RLS n'aurait rien à évaluer et l'événement ne serait
          // même pas délivré.
          const id = (msg.old as Partial<Task>).id;
          if (id) courant.current.setTasks((ts) => retirer(ts, id));
          return;
        }
        const t = msg.new as Task;
        courant.current.setTasks((ts) => {
          // On ne fait entrer que ce qu'on garderait au chargement : sinon le
          // temps réel réintroduirait par la fenêtre les archives que #40 a
          // sorties par la porte. Une ligne DÉJÀ connue reste suivie, elle —
          // c'est ce qui permet de voir une tâche se faire cocher à distance.
          const connue = ts.some((x) => x.id === t.id);
          if (!connue && !courant.current.admits(t)) return ts;
          return fusionner(ts, t);
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: filtre }, (msg) => {
        if (msg.eventType === 'DELETE') {
          const id = (msg.old as Partial<Board>).id;
          if (id) {
            courant.current.setBoards((bs) => retirer(bs, id));
            // `on delete cascade` emporte les tâches côté base, mais aucun
            // événement ne le dit : sans ce nettoyage, elles resteraient en
            // mémoire, rattachées à une matrice disparue.
            courant.current.setTasks((ts) => ts.filter((t) => t.board_id !== id));
          }
          return;
        }
        courant.current.setBoards((bs) => fusionner(bs, msg.new as Board));
      })
      // Les pièces jointes suivent la même règle que le reste (#78) : sans ça,
      // un lien ajouté dans un onglet n'apparaîtrait dans l'autre qu'au
      // rechargement. Pas de `admits` ici — un lien appartient à sa tâche, et
      // c'est la présence de la TÂCHE qui décide de ce qu'on affiche.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_attachments', filter: filtre }, (msg) => {
        if (msg.eventType === 'DELETE') {
          const id = (msg.old as Partial<Attachment>).id;
          return void (id && courant.current.setAttachments((as) => retirer(as, id)));
        }
        courant.current.setAttachments((as) => fusionner(as, msg.new as Attachment));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'universes', filter: filtre }, (msg) => {
        if (msg.eventType === 'DELETE') {
          const id = (msg.old as Partial<Universe>).id;
          if (id) courant.current.setUniverses((us) => retirer(us, id));
          return;
        }
        courant.current.setUniverses((us) => fusionner(us, msg.new as Universe));
      })
      .subscribe((statut) => {
        // Pendant une coupure, les événements sont perdus : les rejouer est
        // impossible, donc on repart de la vérité. C'est aussi ce qui rattrape
        // une mise en veille de l'appareil.
        if (statut !== 'SUBSCRIBED') return;
        if (dejaAbonne.current) void courant.current.reload();
        dejaAbonne.current = true;
      });

    return () => {
      void supabase.removeChannel(canal);
    };
    // Seul `userId` provoque une nouvelle connexion — `sink` passe par la ref,
    // précisément pour ne pas figurer ici.
  }, [userId]);
}
