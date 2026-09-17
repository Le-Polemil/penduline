import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { z } from 'zod';
import type { Db } from '../db';
import { DbError } from '../db';
import { QuotaError, type Quota } from '../quota';
import * as outils from './tools';

/**
 * Le serveur MCP proprement dit : les neuf outils, et rien d'autre.
 *
 * Un `McpServer` neuf est fabriqué à CHAQUE requête (voir `index.ts`) : le
 * transport est sans session, chaque appel porte son propre jeton, et deux
 * requêtes concurrentes ne doivent partager ni état ni identifiants de requête.
 */

const QUADRANTS = ['faire', 'planifier', 'deleguer', 'eliminer', 'parking'] as const;

const quadrant = z
  .enum(QUADRANTS)
  .describe(
    'Case de la matrice : faire (urgent+important), planifier (important), deleguer (urgent), eliminer (ni l’un ni l’autre), parking (à trier).',
  );

/**
 * ⚠️ `z.guid()` et NON `z.uuid()`.
 *
 * `z.uuid()` impose les bits de version et de variante de la RFC 9562. Une
 * colonne `uuid` de Postgres, elle, accepte n'importe quel entier de 128 bits —
 * et le seed du dépôt en contient (`a1111111-0000-0000-0000-000000000001`).
 * Valider strictement rendrait donc des identifiants PARFAITEMENT valides
 * inutilisables par l'agent, pour une garantie dont personne n'a l'usage ici :
 * la forme n'est qu'un garde-fou de frappe, c'est la RLS qui décide de l'accès.
 */
const uuid = z.guid();

export interface Deps {
  db: Db;
  quota: Quota;
}

/** Ce que le middleware d'authentification a posé sur le jeton. */
export interface AuthExtra extends Record<string, unknown> {
  userId: string;
  grantId: string;
}

function contexte(db: Db, authInfo: AuthInfo | undefined) {
  const extra = authInfo?.extra as AuthExtra | undefined;
  if (!extra?.userId) throw new Error('appel non authentifié');
  return { ctx: { db, userId: extra.userId }, grantId: extra.grantId };
}

type Resultat = { content: { type: 'text'; text: string }[]; isError?: boolean };

const rendu = (valeur: unknown): Resultat => ({
  content: [{ type: 'text', text: JSON.stringify(valeur, null, 2) }],
});

/**
 * Une erreur d'outil est RENDUE, pas levée : l'agent doit la lire pour corriger
 * son appel. Le message de PostgREST arrive tel quel — il nomme la contrainte ou
 * la policy qui a refusé, ce qu'aucune reformulation ne dirait mieux.
 */
async function protege(travail: () => Promise<Resultat>): Promise<Resultat> {
  try {
    return await travail();
  } catch (e) {
    if (e instanceof outils.ToolError || e instanceof QuotaError || e instanceof DbError) {
      return { content: [{ type: 'text', text: e.message }], isError: true };
    }
    throw e;
  }
}

export function creerServeur({ db, quota }: Deps): McpServer {
  const serveur = new McpServer(
    { name: 'penduline', version: '1.0.0' },
    {
      instructions:
        'Penduline range des tâches dans des matrices d’Eisenhower. Un univers regroupe des matrices, une matrice porte quatre cases plus un « parking » à trier. Une tâche peut avoir des étapes (un seul niveau).',
    },
  );

  // ── Lectures ───────────────────────────────────────────────────────────────

  serveur.registerTool(
    'list_universes',
    {
      title: 'Lister les univers',
      description: 'Les univers de l’utilisateur, dans leur ordre d’affichage.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async (_args, extra) =>
      protege(async () => {
        const { ctx } = contexte(db, extra.authInfo);
        return rendu(await outils.listUniverses(ctx));
      }),
  );

  serveur.registerTool(
    'list_boards',
    {
      title: 'Lister les matrices',
      description: 'Les matrices de l’utilisateur, dans leur ordre d’affichage.',
      inputSchema: {
        universe_id: uuid.optional().describe('Restreindre à un univers.'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx } = contexte(db, extra.authInfo);
        return rendu(await outils.listBoards(ctx, args));
      }),
  );

  serveur.registerTool(
    'list_tasks',
    {
      title: 'Lister les tâches',
      description:
        'Les tâches OUVERTES d’une matrice, triées par position. `tout` rend aussi les terminées, les supprimées et les étapes.',
      inputSchema: {
        board_id: uuid,
        quadrant: quadrant.optional(),
        tout: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx } = contexte(db, extra.authInfo);
        return rendu(await outils.listTasks(ctx, args));
      }),
  );

  // ── Écritures ──────────────────────────────────────────────────────────────

  serveur.registerTool(
    'create_universe',
    {
      title: 'Créer un univers',
      description: 'Ajoute un univers à la fin de la liste.',
      inputSchema: { name: z.string().min(1).max(120) },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx, grantId } = contexte(db, extra.authInfo);
        quota.verifieEcriture(grantId);
        return rendu(await outils.createUniverse(ctx, args));
      }),
  );

  serveur.registerTool(
    'create_board',
    {
      title: 'Créer une matrice',
      description: 'Ajoute une matrice, éventuellement rangée dans un univers.',
      inputSchema: {
        name: z.string().min(1).max(120),
        universe_id: uuid.optional(),
      },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx, grantId } = contexte(db, extra.authInfo);
        quota.verifieEcriture(grantId);
        return rendu(await outils.createBoard(ctx, args));
      }),
  );

  serveur.registerTool(
    'create_task',
    {
      title: 'Créer une tâche',
      description:
        'Ajoute une tâche en fin de case. Sans `quadrant`, elle arrive dans le parking « à trier ». Avec `parent_id`, elle devient une étape et hérite de la case de son parent.',
      inputSchema: {
        board_id: uuid,
        title: z.string().min(1).max(500),
        quadrant: quadrant.optional(),
        parent_id: uuid.optional().describe('Rattacher comme étape d’une tâche existante.'),
        due_at: z.string().optional().describe('Échéance, en ISO 8601 UTC.'),
      },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx, grantId } = contexte(db, extra.authInfo);
        quota.verifieEcriture(grantId);
        return rendu(await outils.createTask(ctx, args));
      }),
  );

  serveur.registerTool(
    'update_task',
    {
      title: 'Modifier une tâche',
      description:
        'Change le titre ou l’échéance d’UNE tâche. Ne touche jamais sa partenaire de paire. Pour la déplacer, utiliser move_task.',
      inputSchema: {
        task_id: uuid,
        title: z.string().min(1).max(500).optional(),
        due_at: z.string().nullable().optional().describe('`null` retire l’échéance.'),
      },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx, grantId } = contexte(db, extra.authInfo);
        quota.verifieEcriture(grantId);
        return rendu(await outils.updateTask(ctx, args));
      }),
  );

  serveur.registerTool(
    'move_task',
    {
      title: 'Déplacer une tâche',
      description:
        'Déplace une tâche vers une autre case ou une autre matrice, en fin de liste. Si elle est appairée, sa partenaire la suit.',
      inputSchema: {
        task_id: uuid,
        quadrant: quadrant.optional(),
        board_id: uuid.optional(),
      },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx, grantId } = contexte(db, extra.authInfo);
        quota.verifieEcriture(grantId);
        return rendu({ writes: await outils.moveTask(ctx, args) });
      }),
  );

  serveur.registerTool(
    'complete_task',
    {
      title: 'Terminer une tâche',
      description:
        'Coche et range la tâche : elle quitte la grille pour la corbeille « Terminées ». Si elle était appairée, le lien se défait.',
      inputSchema: { task_id: uuid },
    },
    async (args, extra) =>
      protege(async () => {
        const { ctx, grantId } = contexte(db, extra.authInfo);
        quota.verifieEcriture(grantId);
        return rendu({ writes: await outils.completeTask(ctx, args) });
      }),
  );

  return serveur;
}
