import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { createDb } from './db';
import { loadEnv } from './env';
import { HttpError, cors, json, lireFormulaire, lireJson, redirige } from './http';
import { TokenError, createTokens } from './jwt';
import { creerServeur, type AuthExtra } from './mcp/server';
import { deciderAutorisation, demarrerAutorisation, lireDemandePublique, type OAuthGrant } from './oauth/authorize';
import { enregistrerClient } from './oauth/clients';
import { metadonneesRessource, metadonneesServeur } from './oauth/metadata';
import { createStore } from './oauth/store';
import { echangerJetons } from './oauth/token';
import { QuotaError, createQuota } from './quota';

/**
 * Le point d'entrée : sept routes, un serveur `node:http`.
 *
 *   GET  /.well-known/oauth-protected-resource   « qui délivre les jetons ? »
 *   GET  /.well-known/oauth-authorization-server « où, et comment ? »
 *   POST /register                               enregistrement dynamique
 *   GET  /authorize                              ouvre le parcours de consentement
 *   GET  /authorize/request                      ce que l'écran de consentement affiche
 *   POST /authorize/decision                     la réponse de l'utilisateur
 *   POST /token                                  code ou rafraîchissement → jetons
 *   POST /mcp                                    les outils, derrière le jeton d'accès
 */

const env = loadEnv();
const tokens = createTokens(env);
const db = createDb(env, tokens);
const store = createStore();
const quota = createQuota(env);

/**
 * L'en-tête qui rend la découverte automatique possible : un client qui reçoit
 * `401` y lit où trouver les métadonnées, et enchaîne tout seul sur
 * l'enregistrement puis l'autorisation (RFC 9728 §5.1). Sans lui, il faudrait
 * configurer le client à la main — ce que la story cherche précisément à éviter.
 */
function refuseNonAuthentifie(res: ServerResponse, message: string) {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${env.MCP_PUBLIC_URL.replace(/\/$/, '')}/.well-known/oauth-protected-resource"`,
  );
  json(res, 401, { error: 'invalid_token', error_description: message });
}

/**
 * Authentifie l'appel MCP, et relit l'autorisation EN BASE.
 *
 * Cette relecture est le prix de la révocation immédiate : le jeton d'accès vit
 * une heure, et rien dans sa signature ne dira jamais qu'il a été révoqué entre
 * temps. Un appel fait de toute façon des requêtes ; ce `select` de plus évite
 * qu'une application révoquée continue d'écrire pendant une heure.
 */
async function authentifie(req: IncomingMessage): Promise<AuthInfo> {
  const entete = req.headers.authorization ?? '';
  if (!entete.startsWith('Bearer ')) throw new TokenError('jeton absent');

  const jeton = entete.slice('Bearer '.length);
  const { userId, grantId, clientId } = await tokens.verifyMcpAccess(jeton);

  const [grant] = await db.asService().select<OAuthGrant>('oauth_grants', {
    id: `eq.${grantId}`,
    revoked_at: 'is.null',
    select: 'id',
    limit: '1',
  });
  if (!grant) throw new TokenError('autorisation révoquée');

  // Le quota mord ICI, avant que la requête n'atteigne le transport : un client
  // emballé ne doit pas coûter un aller-retour de base par appel refusé.
  quota.verifieAppel(grantId);

  return {
    token: jeton,
    clientId,
    scopes: ['penduline'],
    extra: { userId, grantId } satisfies AuthExtra,
  };
}

async function servirMcp(req: IncomingMessage, res: ServerResponse) {
  const auth = await authentifie(req);
  (req as IncomingMessage & { auth?: AuthInfo }).auth = auth;

  // Un serveur et un transport NEUFS par requête. En mode sans session, deux
  // appels concurrents partageraient sinon leurs identifiants de requête.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const serveur = creerServeur({ db, quota });
  res.on('close', () => {
    void transport.close();
    void serveur.close();
  });

  await serveur.connect(transport);
  await transport.handleRequest(req, res);
}

async function routeur(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', env.MCP_PUBLIC_URL);
  cors(res, env.WEB_APP_URL);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  switch (`${req.method} ${url.pathname}`) {
    case 'GET /sante':
      return json(res, 200, { ok: true });

    case 'GET /.well-known/oauth-protected-resource':
      return json(res, 200, metadonneesRessource(env));

    case 'GET /.well-known/oauth-authorization-server':
      return json(res, 200, metadonneesServeur(env));

    case 'POST /register':
      return json(res, 201, await enregistrerClient(db, await lireJson(req)));

    case 'GET /authorize':
      return redirige(res, await demarrerAutorisation(db, store, env, url.searchParams));

    case 'GET /authorize/request':
      return json(res, 200, lireDemandePublique(store, url.searchParams.get('demande') ?? ''));

    case 'POST /authorize/decision': {
      const corps = await lireJson(req);
      const entete = req.headers.authorization ?? '';
      return json(
        res,
        200,
        await deciderAutorisation(db, store, tokens, {
          demande: String(corps.demande ?? ''),
          autorise: corps.autorise === true,
          jeton: entete.replace(/^Bearer /, ''),
        }),
      );
    }

    case 'POST /token':
      return json(res, 200, await echangerJetons(db, store, tokens, await lireFormulaire(req)));

    case 'POST /mcp':
    case 'GET /mcp':
    case 'DELETE /mcp':
      return servirMcp(req, res);

    default:
      return json(res, 404, { error: 'not_found' });
  }
}

const serveur = createServer((req, res) => {
  routeur(req, res).catch((e: unknown) => {
    if (res.headersSent) return;

    if (e instanceof QuotaError) {
      res.setHeader('Retry-After', String(e.retryAfter));
      return json(res, 429, { error: 'rate_limited', error_description: e.message });
    }
    if (e instanceof TokenError) return refuseNonAuthentifie(res, e.message);
    if (e instanceof HttpError) {
      return json(res, e.status, {
        error: e.code ?? 'invalid_request',
        error_description: e.message,
      });
    }

    // Tout le reste est une panne de notre côté : on la journalise en entier et
    // on n'en rend RIEN — un message d'erreur interne renseigne l'appelant sur
    // ce qu'il n'a pas à savoir.
    console.error('[mcp] erreur non gérée', e);
    json(res, 500, { error: 'server_error' });
  });
});

serveur.listen(env.PORT, () => {
  console.log(`[mcp] à l'écoute sur :${env.PORT} — ${env.MCP_PUBLIC_URL}`);
});
