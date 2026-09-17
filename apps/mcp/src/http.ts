import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Le strict nécessaire pour servir sept routes fixes.
 *
 * Pas d'express ni de hono : le transport du SDK prend des `req`/`res` Node
 * bruts, et OAuth n'ajoute que six chemins connus d'avance. Un routeur de
 * bibliothèque n'apporterait ici qu'une dépendance de plus à suivre, pour un
 * `switch` qu'on écrit en dix lignes.
 */

export interface Contexte {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
}

export type Route = {
  methodes: string[];
  chemin: string;
  handler: (ctx: Contexte) => Promise<void> | void;
};

/** Corps d'une requête, plafonné. Un corps non borné est un déni de service offert. */
const TAILLE_MAX = 1024 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Le code d'erreur OAuth, quand la réponse doit en porter un (RFC 6749 §5.2). */
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function lireCorps(req: IncomingMessage): Promise<string> {
  let taille = 0;
  const morceaux: Buffer[] = [];
  for await (const morceau of req) {
    taille += morceau.length;
    if (taille > TAILLE_MAX) throw new HttpError(413, 'corps trop volumineux');
    morceaux.push(morceau as Buffer);
  }
  return Buffer.concat(morceaux).toString('utf8');
}

export async function lireJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const texte = await lireCorps(req);
  if (!texte) return {};
  try {
    const valeur: unknown = JSON.parse(texte);
    if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
      throw new Error('objet attendu');
    }
    return valeur as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'corps JSON invalide', 'invalid_request');
  }
}

/**
 * `/token` reçoit du `application/x-www-form-urlencoded` : la RFC 6749 l'impose,
 * et tous les clients OAuth l'envoient ainsi. Certains envoient du JSON ; on
 * accepte les deux plutôt que de renvoyer une erreur que le client ne saura pas
 * interpréter.
 */
export async function lireFormulaire(req: IncomingMessage): Promise<Record<string, string>> {
  const texte = await lireCorps(req);
  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/json')) {
    try {
      return JSON.parse(texte) as Record<string, string>;
    } catch {
      throw new HttpError(400, 'corps JSON invalide', 'invalid_request');
    }
  }
  return Object.fromEntries(new URLSearchParams(texte));
}

export function json(res: ServerResponse, status: number, corps: unknown): void {
  const texte = JSON.stringify(corps);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(texte),
    // Les métadonnées de découverte sont publiques et stables ; le reste ne doit
    // JAMAIS être mis en cache — il contient des jetons.
    'Cache-Control': 'no-store',
  });
  res.end(texte);
}

export function redirige(res: ServerResponse, vers: string): void {
  res.writeHead(302, { Location: vers, 'Cache-Control': 'no-store' });
  res.end();
}

/**
 * CORS, volontairement étroit : seule l'application web appelle depuis un
 * navigateur (l'écran de consentement poste sur `/authorize/decision`). Les
 * clients MCP, eux, ne sont pas soumis à la politique d'origine.
 *
 * `*` conviendrait pour les métadonnées publiques, mais pas pour une route qui
 * lit un jeton de session dans un en-tête : ouvrir large ici laisserait
 * n'importe quelle page appeler `/authorize/decision` avec les identifiants de
 * l'utilisateur.
 */
export function cors(res: ServerResponse, origineAutorisee: string): void {
  res.setHeader('Access-Control-Allow-Origin', origineAutorisee);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-protocol-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

export function trouveRoute(routes: Route[], methode: string, chemin: string): Route | undefined {
  return routes.find((r) => r.chemin === chemin && r.methodes.includes(methode));
}
