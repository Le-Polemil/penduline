import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Le cloisonnement du partage, vérifié contre un Supabase réel, à DEUX COMPTES.
 *
 * ⚠️ **C'est le livrable de sécurité de #53, pas une vérification de fin.**
 *
 * Depuis #117, il n'y a plus aucun filtre client pour masquer une policy trop
 * large : la RLS est le levier UNIQUE de la délivrance, temps réel compris. Une
 * erreur de policy n'expose donc plus seulement des lectures, elle expose un
 * flux poussé — et rien dans l'interface ne le montrerait. La non-délivrance
 * croisée est la seule preuve qu'il reste, et elle ne s'obtient qu'ici : aucun
 * test unitaire ne peut exercer une policy Postgres.
 *
 * ⚠️ **Désactivée par défaut**, comme `realtime.live.test.ts` — elle exige un
 * serveur qui tourne, ce qu'aucune CI n'a ici :
 *
 * ```bash
 * npm run start -w @penduline/supabase              # si le stack est éteint
 * PENDULINE_LIVE=1 PENDULINE_LIVE_URL=http://127.0.0.1:55321 \
 *   npm test -w @penduline/shared -- partage.live
 * ```
 *
 * ⚠️ Le port : `supabase status` annonce celui de `config.toml`, pas celui que
 * Docker publie réellement quand un autre projet occupe déjà 54321.
 * `docker ps | grep supabase_kong_penduline` donne la vérité.
 */

const ENV =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const ACTIF = !!ENV.PENDULINE_LIVE;
const URL = ENV.PENDULINE_LIVE_URL ?? 'http://127.0.0.1:54321';
/** Clé anonyme du stack LOCAL : identique sur toute installation, non secrète. */
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** Le propriétaire de la matrice d'essai. */
let hote: SupabaseClient;
/** Celui à qui rien n'est dû tant qu'on ne lui a rien ouvert. */
let invite: SupabaseClient;
let hoteId = '';
let inviteId = '';
/** La matrice d'essai, créée puis détruite par ce fichier — jamais une du seed. */
let boardId = '';
let tacheId = '';

async function connecter(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: 'password123' });
  if (error) throw new Error(`connexion « ${email} » impossible (seed.sql appliqué ?) : ${error.message}`);
  return c;
}

/** Retire l'invité de la matrice, quel que soit l'état où le test précédent l'a laissé. */
async function revoquer(): Promise<void> {
  await hote.from('board_members').delete().eq('board_id', boardId).eq('user_id', inviteId);
}

async function partager(role: 'lecture' | 'ecriture'): Promise<void> {
  await revoquer();
  const { error } = await hote
    .from('board_members')
    .insert({ board_id: boardId, user_id: inviteId, role, invited_by: hoteId });
  if (error) throw new Error(`partage impossible : ${error.message}`);
}

describe.skipIf(!ACTIF)('partage d’une matrice, à deux comptes réels', () => {
  beforeAll(async () => {
    hote = await connecter('demo@penduline.test');
    invite = await connecter('intrus@penduline.test');
    hoteId = (await hote.auth.getUser()).data.user!.id;
    inviteId = (await invite.auth.getUser()).data.user!.id;

    const { data, error } = await hote
      .from('boards')
      .insert({ user_id: hoteId, name: 'sonde-partage' })
      .select('id')
      .single();
    if (error) throw new Error(`création de la matrice d’essai : ${error.message}`);
    boardId = data!.id as string;

    const { data: t, error: e2 } = await hote
      .from('tasks')
      .insert({ author_id: hoteId, board_id: boardId, title: 'sonde-tache', quadrant: 'faire' })
      .select('id')
      .single();
    if (e2) throw new Error(`création de la tâche d’essai : ${e2.message}`);
    tacheId = t!.id as string;
  }, 40000);

  afterAll(async () => {
    if (boardId) {
      await hote.from('board_invitations').delete().eq('board_id', boardId);
      // La cascade emporte tâches, liens, adhésions et placements.
      await hote.from('boards').delete().eq('id', boardId);
    }
  });

  // ── Le socle : sans partage, rien ──────────────────────────────────────────

  describe('sans partage', () => {
    beforeAll(revoquer);

    it('l’invité ne voit NI la matrice, NI ses tâches, NI ses liens', async () => {
      const [b, t, a, p] = await Promise.all([
        invite.from('boards').select('id').eq('id', boardId),
        invite.from('tasks').select('id').eq('board_id', boardId),
        invite.from('task_attachments').select('id').eq('board_id', boardId),
        invite.from('board_placements').select('board_id').eq('board_id', boardId),
      ]);
      expect(b.data).toEqual([]);
      expect(t.data).toEqual([]);
      expect(a.data).toEqual([]);
      expect(p.data).toEqual([]);
    });

    it('l’invité ne peut pas écrire dans la matrice', async () => {
      const { error } = await invite
        .from('tasks')
        .insert({ author_id: inviteId, board_id: boardId, title: 'effraction', quadrant: 'faire' });
      expect(error).not.toBeNull();
    });

    it('l’invité ne peut pas s’inviter lui-même', async () => {
      const { error } = await invite
        .from('board_members')
        .insert({ board_id: boardId, user_id: inviteId, role: 'ecriture', invited_by: inviteId });
      expect(error).not.toBeNull();
    });

    it('l’invité ne peut pas se fabriquer un placement vers une matrice qu’il ne voit pas', async () => {
      // Ça ne lui donnerait pas la lecture — les policies de `boards` et `tasks`
      // tiennent seules — mais son accueil afficherait une ligne fantôme.
      const { error } = await invite
        .from('board_placements')
        .insert({ board_id: boardId, user_id: inviteId });
      expect(error).not.toBeNull();
    });
  });

  // ── Lecture seule ──────────────────────────────────────────────────────────

  describe('en lecture', () => {
    beforeAll(() => partager('lecture'));

    it('voit la matrice et ses tâches', async () => {
      const [b, t] = await Promise.all([
        invite.from('boards').select('id').eq('id', boardId),
        invite.from('tasks').select('id').eq('board_id', boardId),
      ]);
      expect(b.data).toHaveLength(1);
      expect(t.data!.length).toBeGreaterThan(0);
    });

    it('reçoit un placement, hors univers', async () => {
      const { data } = await invite.from('board_placements').select('*').eq('board_id', boardId);
      expect(data).toHaveLength(1);
      expect(data![0].universe_id).toBeNull();
    });

    it('ne peut PAS créer de tâche', async () => {
      const { error } = await invite
        .from('tasks')
        .insert({ author_id: inviteId, board_id: boardId, title: 'interdit', quadrant: 'faire' });
      expect(error).not.toBeNull();
    });

    it('ne peut PAS cocher une tâche', async () => {
      // Une policy `using` qui refuse ne lève pas : elle rend la ligne
      // invisible à l'UPDATE. C'est le nombre de lignes touchées qui trahit.
      const { data } = await invite
        .from('tasks')
        .update({ done: true })
        .eq('id', tacheId)
        .select('id');
      expect(data).toEqual([]);
    });

    it('ne peut PAS supprimer une tâche', async () => {
      const { data } = await invite.from('tasks').delete().eq('id', tacheId).select('id');
      expect(data).toEqual([]);
    });
  });

  // ── Écriture ───────────────────────────────────────────────────────────────

  describe('en écriture', () => {
    const ajoutees: string[] = [];
    /**
     * ⚠️ Les matrices d'appoint sont détruites ICI, pas à la fin du test qui les
     * crée. Une assertion qui échoue interrompt le test : le nettoyage écrit
     * après elle ne s'exécute jamais, et la base garde des résidus qui faussent
     * le run suivant. Constaté sur le premier passage de ce fichier.
     */
    const jetables: string[] = [];
    beforeAll(() => partager('ecriture'));
    afterAll(async () => {
      if (ajoutees.length) await hote.from('tasks').delete().in('id', ajoutees);
      for (const c of [hote, invite]) if (jetables.length) await c.from('boards').delete().in('id', jetables);
    });

    it('crée une tâche, et elle porte SON nom d’auteur', async () => {
      const { data, error } = await invite
        .from('tasks')
        .insert({ author_id: inviteId, board_id: boardId, title: 'sonde-invite', quadrant: 'faire' })
        .select('id, author_id')
        .single();
      expect(error).toBeNull();
      expect(data!.author_id).toBe(inviteId);
      ajoutees.push(data!.id as string);
    });

    it('ne peut pas écrire au nom de quelqu’un d’autre', async () => {
      const { error } = await invite
        .from('tasks')
        .insert({ author_id: hoteId, board_id: boardId, title: 'usurpation', quadrant: 'faire' });
      expect(error).not.toBeNull();
    });

    it('coche une tâche, et `completed_by` le désigne', async () => {
      const id = ajoutees[0];
      await invite.from('tasks').update({ done: true }).eq('id', id);
      const { data } = await hote.from('tasks').select('completed_by, completed_at').eq('id', id).single();
      expect(data!.completed_by).toBe(inviteId);
      expect(data!.completed_at).not.toBeNull();
      await invite.from('tasks').update({ done: false }).eq('id', id);
    });

    it('ne peut NI renommer NI supprimer la matrice — « écriture » porte sur le contenu', async () => {
      const r = await invite.from('boards').update({ name: 'détournée' }).eq('id', boardId).select('id');
      const s = await invite.from('boards').delete().eq('id', boardId).select('id');
      expect(r.data).toEqual([]);
      expect(s.data).toEqual([]);
    });

    it('ne peut pas déplacer une tâche vers une matrice où il n’écrit pas', async () => {
      // `using` porte sur la ligne AVANT, `with check` sur la ligne APRÈS : les
      // deux ensemble ferment ce transfert, qui passerait avec le seul `using`.
      const { data: sienne } = await invite
        .from('boards')
        .insert({ user_id: inviteId, name: 'sonde-siphon' })
        .select('id')
        .single();
      jetables.push(sienne!.id as string);
      const { data: autre } = await hote
        .from('boards')
        .insert({ user_id: hoteId, name: 'sonde-hors-partage' })
        .select('id')
        .single();
      jetables.push(autre!.id as string);
      const { error } = await invite
        .from('tasks')
        .update({ board_id: autre!.id })
        .eq('id', ajoutees[0])
        .select('id');
      // Ici le refus LÈVE, là où les autres refus se contentent de ne toucher
      // aucune ligne. La différence dit lequel des deux prédicats a tranché :
      // `using` filtre en silence (la ligne devient invisible à l'UPDATE),
      // `with check` refuse bruyamment (la ligne d'arrivée est inacceptable).
      // C'est donc bien la ligne APRÈS qui est rejetée — la garantie qu'on
      // voulait, et la plus forte des deux.
      expect(error).not.toBeNull();
    });
  });

  // ── Les trois RPC ──────────────────────────────────────────────────────────

  describe('les fonctions RPC, dont le cadrage vient ENTIÈREMENT de la RLS', () => {
    beforeAll(() => partager('ecriture'));

    it('`search_tasks` trouve dans la matrice partagée — élargissement voulu', async () => {
      const { data, error } = await invite.rpc('search_tasks', { q: 'sonde-tache' });
      expect(error).toBeNull();
      expect((data as { board_id: string }[]).some((r) => r.board_id === boardId)).toBe(true);
    });

    it('`search_tasks` ne trouve RIEN dans une matrice non partagée', async () => {
      const { data: hors } = await hote
        .from('boards')
        .insert({ user_id: hoteId, name: 'sonde-secrete' })
        .select('id')
        .single();
      await hote
        .from('tasks')
        .insert({ author_id: hoteId, board_id: hors!.id, title: 'sonde-introuvable', quadrant: 'faire' });
      const { data } = await invite.rpc('search_tasks', { q: 'sonde-introuvable' });
      // Détruite AVANT l'assertion, pour la même raison : une assertion qui
      // échoue ne doit pas laisser de résidu derrière elle.
      await hote.from('boards').delete().eq('id', hors!.id);
      expect(data).toEqual([]);
    });

    it('`completion_stats` ne compte QUE ce que l’appelant a coché', async () => {
      // ⚠️ Le test du trou le plus silencieux du ticket. `completion_stats` est
      // `security invoker` sans prédicat sur la personne : son cadrage venait de
      // la policy `tasks`, qui ne dit plus `user_id = auth.uid()`. Sans
      // `completed_by = auth.uid()`, l'écran de statistiques compterait les
      // complétions des autres — sans erreur, juste des chiffres faux.
      const { data: t } = await invite
        .from('tasks')
        .insert({ author_id: inviteId, board_id: boardId, title: 'sonde-stats', quadrant: 'faire' })
        .select('id')
        .single();
      await invite.from('tasks').update({ done: true }).eq('id', t!.id);

      const depuis = new Date(Date.now() - 86_400_000).toISOString();
      const mien = await invite.rpc('completion_stats', { since: depuis });
      const sien = await hote.rpc('completion_stats', { since: depuis });

      const compte = (r: { by_board?: { board_id: string; completed: number }[] }) =>
        (r.by_board ?? []).filter((b) => b.board_id === boardId).reduce((n, b) => n + b.completed, 0);

      await hote.from('tasks').delete().eq('id', t!.id);

      expect(compte(mien.data)).toBeGreaterThan(0);
      expect(compte(sien.data)).toBe(0);
    });

    it('`review_boards` couvre la matrice partagée, et rien d’autre', async () => {
      const { data } = await invite.rpc('review_boards');
      const vus = (data as { board_id: string }[]).map((r) => r.board_id);
      expect(vus).toContain(boardId);
      // Les matrices du seed appartiennent à l'hôte et ne sont pas partagées.
      const { data: siennes } = await hote.from('boards').select('id').neq('id', boardId);
      for (const b of siennes as { id: string }[]) expect(vus).not.toContain(b.id);
    });
  });

  // ── Invitations ────────────────────────────────────────────────────────────

  describe('invitations par lien', () => {
    beforeAll(revoquer);

    it('le jeton clair n’est JAMAIS stocké', async () => {
      const { data: jeton, error } = await hote.rpc('creer_invitation', {
        p_board: boardId,
        p_role: 'lecture',
        p_email: 'alice@exemple.fr',
      });
      expect(error).toBeNull();
      const { data } = await hote.from('board_invitations').select('token_hash').eq('board_id', boardId);
      expect((data as { token_hash: string }[]).some((i) => i.token_hash === jeton)).toBe(false);
    });

    it('l’invité ne voit pas la table des invitations', async () => {
      const { data } = await invite.from('board_invitations').select('id').eq('board_id', boardId);
      expect(data).toEqual([]);
    });

    it('`lire_invitation` rend ce que dit le SERVEUR, pas ce que porte l’URL', async () => {
      const { data: jeton } = await hote.rpc('creer_invitation', {
        p_board: boardId,
        p_role: 'ecriture',
      });
      const { data } = await invite.rpc('lire_invitation', { jeton });
      expect(data).toHaveLength(1);
      expect(data[0].board_name).toBe('sonde-partage');
      expect(data[0].role).toBe('ecriture');
      expect(data[0].deja_accessible).toBe(false);
    });

    it('un jeton inventé ne rend rien, et ne dit pas pourquoi', async () => {
      const { data } = await invite.rpc('lire_invitation', { jeton: 'deadbeef'.repeat(6) });
      expect(data).toEqual([]);
      const { error } = await invite.rpc('accepter_invitation', { jeton: 'deadbeef'.repeat(6) });
      expect(error).not.toBeNull();
    });

    it('accepter ouvre l’accès, crée le placement, et le lien ne vaut plus rien', async () => {
      await revoquer();
      const { data: jeton } = await hote.rpc('creer_invitation', {
        p_board: boardId,
        p_role: 'lecture',
      });

      const { data: rendu, error } = await invite.rpc('accepter_invitation', { jeton });
      expect(error).toBeNull();
      expect(rendu).toBe(boardId);

      const [b, p] = await Promise.all([
        invite.from('boards').select('id').eq('id', boardId),
        invite.from('board_placements').select('board_id').eq('board_id', boardId),
      ]);
      expect(b.data).toHaveLength(1);
      expect(p.data).toHaveLength(1);

      // Usage unique : le rejeu échoue, et la relecture ne rend plus rien.
      const rejeu = await invite.rpc('accepter_invitation', { jeton });
      expect(rejeu.error).not.toBeNull();
      const relecture = await invite.rpc('lire_invitation', { jeton });
      expect(relecture.data).toEqual([]);
    });
  });

  // ── Quitter, révoquer ──────────────────────────────────────────────────────

  describe('la fin d’un partage', () => {
    it('l’invité peut QUITTER de lui-même, et la matrice reste intacte pour l’hôte', async () => {
      await partager('ecriture');
      const { error } = await invite
        .from('board_members')
        .delete()
        .eq('board_id', boardId)
        .eq('user_id', inviteId);
      expect(error).toBeNull();

      const [b, p, chezHote] = await Promise.all([
        invite.from('boards').select('id').eq('id', boardId),
        invite.from('board_placements').select('board_id').eq('board_id', boardId),
        hote.from('boards').select('id').eq('id', boardId),
      ]);
      expect(b.data).toEqual([]);
      expect(p.data).toEqual([]);
      expect(chezHote.data).toHaveLength(1);
    });

    it('l’hôte révoque, et TOUT retombe : lecture, écriture, placement', async () => {
      await partager('ecriture');
      await revoquer();

      const [b, t, p] = await Promise.all([
        invite.from('boards').select('id').eq('id', boardId),
        invite.from('tasks').select('id').eq('board_id', boardId),
        invite.from('board_placements').select('board_id').eq('board_id', boardId),
      ]);
      expect(b.data).toEqual([]);
      expect(t.data).toEqual([]);
      expect(p.data).toEqual([]);

      const { error } = await invite
        .from('tasks')
        .insert({ author_id: inviteId, board_id: boardId, title: 'apres-revocation', quadrant: 'faire' });
      expect(error).not.toBeNull();
    });

    it('un invité ne peut pas révoquer QUELQU’UN D’AUTRE', async () => {
      await partager('ecriture');
      // L'hôte n'est pas dans `board_members` — on vise donc une seconde
      // adhésion fictive, celle de l'hôte lui-même, pour éprouver la policy.
      await hote
        .from('board_members')
        .insert({ board_id: boardId, user_id: hoteId, role: 'lecture', invited_by: hoteId });
      const { data } = await invite
        .from('board_members')
        .delete()
        .eq('board_id', boardId)
        .eq('user_id', hoteId)
        .select('user_id');
      expect(data).toEqual([]);
      await hote.from('board_members').delete().eq('board_id', boardId).eq('user_id', hoteId);
    });
  });
});
