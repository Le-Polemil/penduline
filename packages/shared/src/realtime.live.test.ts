import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { subscribeRealtime, type RealtimeSink } from './realtime';
import type { Board, Task, Universe } from './types';

/**
 * Vérification de BOUT EN BOUT du temps réel, contre un Supabase réel.
 *
 * ⚠️ **Désactivée par défaut** — elle exige un serveur qui tourne, ce qu'aucune
 * CI n'a ici. Elle ne s'exécute que sur demande :
 *
 * ```bash
 * npm run start -w @penduline/supabase        # si le stack local est éteint
 * PENDULINE_LIVE=1 npm test -w @penduline/shared
 * ```
 *
 * `PENDULINE_LIVE_URL` permet de viser un autre port que celui de `config.toml`
 * (utile quand un autre projet Supabase occupe déjà 54321 — le `supabase status`
 * annonce alors le port CONFIGURÉ, pas celui réellement publié par Docker :
 * `docker ps` sur `supabase_kong_penduline` donne la vérité).
 *
 * **Pourquoi elle existe, alors que le reste du fichier `realtime.test.ts` est
 * purement unitaire.** Le mode de défaillance du temps réel est le SILENCE : une
 * publication vide, une `replica identity` par défaut, un filtre serveur trop
 * étroit — dans les trois cas l'abonnement atteint `SUBSCRIBED` et ne reçoit
 * rien, sans erreur ni log. #39 a payé une journée de débogage pour cette
 * leçon. Aucun test unitaire ne peut l'attraper : il faut un vrai WAL. C'est
 * C'est aussi ici qu'a été établi, par sonde, que le filtre serveur est la SEULE
 * barrière des événements `DELETE` — la RLS ne leur est pas appliquée. Le
 * dernier test de ce fichier verrouille cette propriété : il échouera si
 * quelqu'un retire le filtre en croyant la RLS suffisante.
 */
/**
 * L'environnement, lu par `globalThis` plutôt que par `process` : ce paquet n'a
 * pas `@types/node` et n'a aucune raison de l'acquérir — c'est de la logique
 * partagée entre un navigateur et un service worker. Un `process.env` nu ne
 * compile pas ici.
 */
const ENV =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const ACTIF = !!ENV.PENDULINE_LIVE;
const URL = ENV.PENDULINE_LIVE_URL ?? 'http://127.0.0.1:54321';
/** Clé anonyme du stack LOCAL : identique sur toute installation, non secrète. */
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** Miroir du `select` du panneau : ce qui a sa place en mémoire. */
const admits = (t: Task) => !t.done && !t.deleted && t.parent_id === null;

let abonne: SupabaseClient;
let ecrivain: SupabaseClient;
let stop: (() => void) | null = null;
let boardId = '';
let userId = '';
const cree: string[] = [];

let taches: Task[] = [];
const sink: RealtimeSink = {
  setTasks: (fn) => {
    taches = fn(taches);
  },
  setBoards: (fn) => void fn([] as Board[]),
  setUniverses: (fn) => void fn([] as Universe[]),
  admits,
  reload: async () => {},
};

/** Attend qu'une condition sur l'état fusionné devienne vraie. */
async function attendre(cond: () => boolean, ms = 6000): Promise<boolean> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return cond();
}

describe.skipIf(!ACTIF)('temps réel, contre un Supabase réel', () => {
  beforeAll(async () => {
    abonne = createClient(URL, ANON, { auth: { persistSession: false } });
    ecrivain = createClient(URL, ANON, { auth: { persistSession: false } });
    // Deux clients distincts, et c'est le point : on veut voir arriver
    // l'écriture d'AUTRUI, pas l'écho de la sienne.
    for (const c of [abonne, ecrivain]) {
      const { error } = await c.auth.signInWithPassword({
        email: 'demo@penduline.test',
        password: 'password123',
      });
      if (error) throw new Error(`connexion impossible (seed.sql appliqué ?) : ${error.message}`);
    }
    userId = (await abonne.auth.getUser()).data.user!.id;
    const { data } = await ecrivain.from('boards').select('id').limit(1);
    if (!data?.length) throw new Error('aucune matrice — seed.sql non appliqué ?');
    boardId = data[0].id as string;

    // ⚠️ Attendre le VRAI `onLive`, jamais une temporisation devinée : Realtime
    // ne rejoue pas les événements, donc une écriture partie avant que la
    // souscription n'aboutisse est PERDUE — et le test échouerait pour une
    // raison étrangère au code testé. La première version de ce fichier
    // patientait 2,5 s en dur, et l'INSERT était bel et bien manqué.
    let live = false;
    stop = subscribeRealtime(abonne, userId, () => sink, {
      onLive: (l) => {
        live = l;
      },
    });
    if (!(await attendre(() => live, 15000))) {
      throw new Error('la souscription n’a jamais abouti — service Realtime éteint ?');
    }
  }, 40000);

  afterAll(async () => {
    stop?.();
    if (cree.length) await ecrivain.from('tasks').delete().in('id', cree);
  });

  it('délivre un INSERT distant', async () => {
    const { data, error } = await ecrivain
      .from('tasks')
      .insert({
        user_id: userId,
        board_id: boardId,
        title: 'sonde-insert',
        quadrant: 'faire',
        position: 9001,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    cree.push(data!.id as string);
    expect(await attendre(() => taches.some((t) => t.title === 'sonde-insert'))).toBe(true);
  }, 20000);

  it('délivre un UPDATE distant', async () => {
    const id = cree[0];
    await ecrivain.from('tasks').update({ title: 'sonde-renommee' }).eq('id', id);
    expect(
      await attendre(() => taches.some((t) => t.id === id && t.title === 'sonde-renommee')),
    ).toBe(true);
  }, 20000);

  it('écarte une tâche qui n’a pas sa place — `admits` fait son travail', async () => {
    const { data } = await ecrivain
      .from('tasks')
      .insert({
        user_id: userId,
        board_id: boardId,
        title: 'sonde-cochee',
        quadrant: 'faire',
        position: 9002,
        done: true,
      })
      .select('id')
      .single();
    cree.push(data!.id as string);
    // On attend volontairement en vain : l'événement ARRIVE, mais la fusion doit
    // le refuser. C'est la garantie que le temps réel ne réintroduit pas par la
    // fenêtre ce que le chargement sort par la porte (#40).
    await new Promise((r) => setTimeout(r, 3000));
    expect(taches.some((t) => t.title === 'sonde-cochee')).toBe(false);
  }, 20000);

  it('ne délivre RIEN à un autre compte — y compris les DELETE', async () => {
    // ⚠️ LE TEST QUI VERROUILLE LA LEÇON DU 8 SEPTEMBRE. Le filtre serveur avait
    // été retiré, au motif qu'il doublait la RLS. C'est vrai pour INSERT et
    // UPDATE. C'est FAUX pour DELETE : Realtime n'y applique aucune policy, il
    // caviarde seulement la charge utile à la clé primaire. Sans filtre, tout
    // client authentifié recevait donc l'identifiant de chaque suppression de la
    // base — celles des autres comptes comprises.
    //
    // Le compte tiers est provisionné à la demande, faute de figurer dans
    // `seed.sql` : sans lui, ce test s'abstient plutôt que de mentir.
    const tiers = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error: refus } = await tiers.auth.signInWithPassword({
      email: 'intrus@penduline.test',
      password: 'password123',
    });
    if (refus) {
      console.warn('[live] compte « intrus@penduline.test » absent — cloisonnement non vérifié');
      return;
    }
    const tiersId = (await tiers.auth.getUser()).data.user!.id;
    /**
     * On compte les APPELS AU SINK, et non les charges utiles : c'est le chemin
     * livré de bout en bout. Une fuite `DELETE` appellerait `setTasks` même si
     * `retirer` renvoie ensuite la même référence — l'appel suffit à la trahir.
     */
    let appels = 0;
    const compteur = () => {
      appels += 1;
    };
    let live = false;
    const arret = subscribeRealtime(
      tiers,
      tiersId,
      () => ({
        setTasks: compteur,
        setBoards: compteur,
        setUniverses: compteur,
        admits: () => true,
        reload: async () => {},
      }),
      { onLive: (l) => { live = l; } },
    );
    if (!(await attendre(() => live, 15000))) throw new Error('tiers non abonné');

    const { data } = await ecrivain
      .from('tasks')
      .insert({
        user_id: userId,
        board_id: boardId,
        title: 'sonde-cloisonnement',
        quadrant: 'faire',
        position: 9003,
      })
      .select('id')
      .single();
    await ecrivain.from('tasks').delete().eq('id', data!.id as string);
    await new Promise((r) => setTimeout(r, 4000));
    arret();
    expect(appels).toBe(0);
  }, 30000);

  it('délivre un DELETE distant — `replica identity full` en place', async () => {
    const id = cree[0];
    await ecrivain.from('tasks').delete().eq('id', id);
    // Sans `replica identity full`, la ligne supprimée n'arriverait qu'avec sa
    // clé primaire : la RLS n'aurait rien à évaluer et l'événement ne serait même
    // pas délivré. Ce test échouerait donc si la migration régressait.
    expect(await attendre(() => !taches.some((t) => t.id === id))).toBe(true);
  }, 20000);
});
