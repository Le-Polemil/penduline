import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Task } from '@penduline/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db';
import { createQuota } from '../quota';
import { envDeTest, fausseDb } from '../test-doubles';
import { creerServeur } from './server';
import { MIME_APP, URI_VISUEL } from './ui';

/**
 * Le serveur de bout en bout, par un VRAI client MCP branché en mémoire : c'est
 * ce que voit un hôte. Deux promesses à tenir :
 *
 *   1. les outils annoncent leur visuel, et la ressource se lit ;
 *   2. le texte `content` de chaque outil est EXACTEMENT celui d'avant — les
 *      visuels ne font que s'ajouter, et leur échec ne casse rien.
 */

const UTILISATEUR = '11111111-1111-4111-8111-111111111111';
const MATRICE = 'a1111111-0000-0000-0000-000000000001';
const UNIVERS = 'a2222222-0000-0000-0000-000000000001';

const AUTH: AuthInfo = {
  token: 'jeton',
  clientId: 'client',
  scopes: ['penduline'],
  extra: { userId: UTILISATEUR, grantId: 'grant' },
};

function tache(over: Partial<Task> & { id: string }): Task {
  return {
    author_id: UTILISATEUR,
    board_id: MATRICE,
    title: over.id,
    quadrant: 'faire',
    done: false,
    archived: false,
    deleted: false,
    position: 0,
    pair_id: null,
    parent_id: null,
    due_at: null,
    focus_day: null,
    origin: 'user',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    quadrant_changed_at: '2026-09-01T00:00:00Z',
    completed_at: null,
    ...over,
  } as Task;
}

const T1 = 'b1111111-0000-0000-0000-000000000001';
const T2 = 'b1111111-0000-0000-0000-000000000002';

function tables() {
  return {
    universes: [{ id: UNIVERS, user_id: UTILISATEUR, name: 'Maison', position: 0, origin: 'user', created_at: '' }],
    boards: [{ id: MATRICE, user_id: UTILISATEUR, name: 'Cuisine', origin: 'user', created_at: '' }],
    board_placements: [{ board_id: MATRICE, user_id: UTILISATEUR, universe_id: UNIVERS, position: 0 }],
    tasks: [
      tache({ id: T1, title: 'Préparer la rétro', quadrant: 'planifier', pair_id: 'P', position: 1 }),
      tache({ id: T2, title: 'Réserver la salle', quadrant: 'planifier', pair_id: 'P', position: 2 }),
    ],
  };
}

async function connecte(db: Db) {
  const serveur = creerServeur({
    db,
    quota: createQuota(envDeTest),
    appUrl: 'https://penduline.test',
  });
  const [coteClient, coteServeur] = InMemoryTransport.createLinkedPair();
  // Ce que fait le middleware d'authentification en production : chaque
  // message arrive porteur de l'`authInfo` du jeton.
  const envoi = coteClient.send.bind(coteClient);
  coteClient.send = (message, options) => envoi(message, { ...options, authInfo: AUTH });
  await serveur.connect(coteServeur);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(coteClient);
  return client;
}

type Appel = { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const appelle = async (client: Client, name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as Appel;

describe('ressource d’interface', () => {
  it('les outils à visuel la désignent, les autres non', async () => {
    const client = await connecte(fausseDb(tables()).db);
    const { tools } = await client.listTools();
    const avec = tools.filter((t) => (t._meta?.ui as { resourceUri?: string })?.resourceUri === URI_VISUEL);

    expect(avec.map((t) => t.name).sort()).toEqual([
      'complete_task',
      'create_task',
      'list_boards',
      'list_tasks',
      'move_task',
      'update_task',
    ]);
    for (const t of avec) expect(t._meta?.['ui/resourceUri']).toBe(URI_VISUEL);
  });

  it('se liste et se lit, en `text/html;profile=mcp-app`', async () => {
    const client = await connecte(fausseDb(tables()).db);

    const { resources } = await client.listResources();
    expect(resources).toContainEqual(expect.objectContaining({ uri: URI_VISUEL, mimeType: MIME_APP }));

    const { contents } = await client.readResource({ uri: URI_VISUEL });
    expect(contents).toHaveLength(1);
    expect(contents[0]).toMatchObject({ uri: URI_VISUEL, mimeType: MIME_APP });
    expect(String((contents[0] as { text?: string }).text)).toMatch(/^<!doctype html>/);
    expect(contents[0]._meta).toMatchObject({ ui: { prefersBorder: false } });
  });
});

describe('les résultats', () => {
  it('list_tasks : le texte d’avant, plus la vue « matrice »', async () => {
    const { db } = fausseDb(tables());
    const client = await connecte(db);

    const r = await appelle(client, 'list_tasks', { board_id: MATRICE });

    const attendu = tables().tasks.sort((a, b) => a.position - b.position);
    expect(r.content).toEqual([{ type: 'text', text: JSON.stringify(attendu, null, 2) }]);
    expect(r.structuredContent).toMatchObject({
      vue: 'matrice',
      surtitre: 'Penduline · Maison',
      matrice: 'Cuisine',
      lien: 'https://penduline.test/',
    });
  });

  it('list_boards : la vue « vos matrices »', async () => {
    const client = await connecte(fausseDb(tables()).db);

    const r = await appelle(client, 'list_boards', {});

    expect(JSON.parse(r.content[0].text)).toHaveLength(1);
    expect(r.structuredContent).toMatchObject({
      vue: 'matrices',
      groupes: [{ nom: 'Maison', matrices: [{ nom: 'Cuisine', ouvertes: 2 }] }],
    });
  });

  it('move_task : `{ writes }` comme avant, et la paire qui a suivi', async () => {
    const client = await connecte(fausseDb(tables()).db);

    const r = await appelle(client, 'move_task', { task_id: T1, quadrant: 'faire' });

    expect(Object.keys(JSON.parse(r.content[0].text))).toEqual(['writes']);
    expect(r.structuredContent).toMatchObject({
      vue: 'ecriture',
      type: 'deplacement',
      de: { key: 'planifier' },
      vers: { key: 'faire' },
      paire: 'Réserver la salle',
      chemin: 'Maison › Cuisine',
    });
  });

  it('complete_task : la carte « terminée » et la paire défaite', async () => {
    const client = await connecte(fausseDb(tables()).db);

    const r = await appelle(client, 'complete_task', { task_id: T1 });

    expect(r.structuredContent).toMatchObject({
      type: 'terminee',
      paireDefaite: { titre: 'Réserver la salle' },
    });
  });

  it('create_task : la carte « ajoutée »', async () => {
    const client = await connecte(fausseDb(tables()).db);

    const r = await appelle(client, 'create_task', { board_id: MATRICE, title: 'Racheter des joints', quadrant: 'faire' });

    expect(JSON.parse(r.content[0].text)).toMatchObject({ title: 'Racheter des joints', origin: 'agent' });
    expect(r.structuredContent).toMatchObject({ type: 'ajout', surtitre: 'Ajoutée dans Faire', agent: true });
  });

  it('une erreur d’outil reste une erreur, sans visuel', async () => {
    const client = await connecte(fausseDb(tables()).db);

    const r = await appelle(client, 'complete_task', { task_id: 'c1111111-0000-0000-0000-000000000009' });

    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
  });

  it('si la lecture du visuel échoue, l’outil rend son texte comme avant', async () => {
    const { db } = fausseDb(tables());
    // Les lectures propres au visuel (`boards`, `board_placements`) tombent ;
    // celles de l'outil (`tasks`) passent.
    const fragile: Db = {
      ...db,
      asUser(id) {
        const rest = db.asUser(id);
        return {
          ...rest,
          async select(table, filtres) {
            if (table === 'boards') throw new Error('panne');
            return rest.select(table, filtres);
          },
        };
      },
    };
    const client = await connecte(fragile);
    const avertit = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await appelle(client, 'move_task', { task_id: T1, quadrant: 'faire' });

    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0].text).writes).toHaveLength(2);
    expect(r.structuredContent).toBeUndefined();
    expect(avertit).toHaveBeenCalledWith('[mcp] visuel indisponible :', 'panne');
    avertit.mockRestore();
  });
});
