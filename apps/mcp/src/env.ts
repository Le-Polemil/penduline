import { z } from 'zod';

/**
 * Les variables d'environnement du serveur MCP, lues et validées UNE FOIS au
 * démarrage.
 *
 * Le parti pris : échouer franchement, tout de suite, et en disant TOUT ce qui
 * manque. Un serveur qui démarre avec un secret absent ne tombe pas au
 * démarrage — il tombe au premier appel d'un client, des heures plus tard, sur
 * un message qui ne parle plus de configuration. Et une valeur par défaut muette
 * ferait pire : le serveur signerait des jetons avec un secret deviné.
 *
 * `readEnv` est PURE et prend sa source en paramètre, pour la même raison que
 * `p_now` dans `penduline_tick()` ou `now = Date.now()` dans `packages/shared` :
 * c'est ce qui la rend vérifiable sans toucher au `process.env` du processus de
 * test.
 */

const url = z.url({ protocol: /^https?$/ });

/**
 * Longueur minimale des secrets. 32 caractères n'est pas un chiffre magique :
 * c'est le plancher en dessous duquel un HS256 devient attaquable hors ligne,
 * et le seul contrôle qu'on puisse faire ici sans connaître la provenance de la
 * valeur.
 */
const secret = z.string().min(32, 'au moins 32 caractères');

const schema = z.object({
  /** Kong, pas Postgres : le serveur parle à PostgREST comme n'importe quel client. */
  SUPABASE_URL: url,
  /** Kong exige l'en-tête `apikey` même sur une requête déjà porteuse d'un JWT. */
  SUPABASE_ANON_KEY: z.string().min(1),
  /** Celui de l'instance : vérifie le JWT entrant, et signe les deux jetons de 60 s. */
  SUPABASE_JWT_SECRET: secret,
  /**
   * DISTINCT du précédent, et c'est la décision de sécurité du ticket : un jeton
   * d'accès MCP signé avec ce secret-là n'a aucune valeur contre PostgREST, donc
   * un client ne peut pas court-circuiter le serveur pour taper la base.
   */
  MCP_TOKEN_SECRET: secret,
  /** L'URL publique du serveur, telle que les métadonnées OAuth l'annoncent. */
  MCP_PUBLIC_URL: url,
  /** L'application web, vers laquelle `/authorize` renvoie pour le consentement. */
  WEB_APP_URL: url,

  // ── Réglages, avec des défauts assumés et documentés ───────────────────────
  //
  // Ceux-là PEUVENT avoir un défaut : ils règlent un comportement, ils ne
  // gardent aucun secret. Les laisser obligatoires n'apporterait rien qu'une
  // ligne de configuration de plus à recopier sans y penser.
  PORT: z.coerce.number().int().positive().default(8787),
  MCP_QUOTA_CALLS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MCP_QUOTA_WRITES_PER_DAY: z.coerce.number().int().positive().default(500),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {}

export function readEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (result.success) {
    // Le seul contrôle qui ne peut pas s'exprimer champ par champ : deux secrets
    // égaux annulent exactement la séparation qu'ils sont là pour porter.
    if (result.data.SUPABASE_JWT_SECRET === result.data.MCP_TOKEN_SECRET) {
      throw new EnvError(
        'Configuration invalide :\n' +
          "  · MCP_TOKEN_SECRET est identique à SUPABASE_JWT_SECRET — un jeton d'accès MCP serait alors accepté par PostgREST.",
      );
    }
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `  · ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
    .join('\n');
  throw new EnvError(`Configuration invalide :\n${details}`);
}

let cached: Env | undefined;

/** Lit `process.env` une seule fois ; les appels suivants renvoient la même valeur. */
export function loadEnv(): Env {
  cached ??= readEnv(process.env);
  return cached;
}
