import {
  type BoardRange,
  type QuadrantKey,
  type Task,
  type TaskWrite,
  type Universe,
  QUADS,
  buildRows,
  deadlineStatus,
  formatDeadline,
  isOpenRow,
  quadrant as laCase,
  splitOverdue,
  visibleTasks,
} from '@penduline/shared';

/**
 * Les « modèles de vue » des visuels Penduline affichés dans Claude.
 *
 * Un hôte qui parle l'extension MCP Apps (`io.modelcontextprotocol/ui`) affiche
 * la page `ui://penduline/visuel.html` à côté du résultat d'un outil, et lui
 * transmet ce résultat. La page lit alors `structuredContent` — et UNIQUEMENT
 * lui : c'est ce fichier qui le fabrique.
 *
 * Le parti pris : **la page ne décide rien.** Tout ce qui demande une règle —
 * l'ordre des lignes, le statut d'une échéance, un pluriel, le libellé d'un
 * pied de carte — est calculé ICI, en TypeScript, par des fonctions pures et
 * testées. La page, elle, n'est qu'un gabarit qui pose du texte dans des boîtes.
 * Deux raisons :
 *
 *   1. Le JavaScript de la page vit dans une chaîne HTML que rien ne type ni ne
 *      teste. Chaque règle qu'on y laisse est une règle qui peut casser en
 *      silence.
 *   2. Les règles existent DÉJÀ dans `packages/shared` — `buildRows` pour les
 *      paires, `splitOverdue` pour remonter les dépassées, `formatDeadline` pour
 *      le libellé d'une échéance. Les réécrire dans la page serait exactement le
 *      défaut que la règle de `tools.ts` interdit : une copie corrigée d'un côté
 *      et oubliée de l'autre.
 *
 * ⚠️ Le texte `content` des outils n'est PAS touché : c'est lui que lit le
 * modèle, et un hôte sans visuels doit se comporter exactement comme avant.
 * `structuredContent` s'AJOUTE à côté, et rien de ce qui suit n'y change rien.
 *
 * `now` en dernier paramètre partout, comme dans `packages/shared` : c'est ce
 * qui rend les échéances testables sans figer l'horloge du processus.
 */

/** Les quatre cases de la grille, dans l'ordre de lecture (gauche→droite, haut→bas). */
export type CaseGrille = Exclude<QuadrantKey, 'parking'>;

/**
 * Combien de lignes une case montre avant de résumer « + N autres ».
 *
 * Une matrice réelle peut porter quarante tâches dans « Planifier » : tout
 * afficher ferait une page de plusieurs écrans dans une conversation, où l'on
 * vient chercher un coup d'œil. Le compteur de la case, lui, reste exact.
 */
export const LIGNES_PAR_CASE = 6;
/** Idem pour les pastilles de « À trier », qui s'enroulent sur une bande. */
export const PASTILLES_PARKING = 8;

export interface EcheanceVue {
  /** Le libellé de l'app (« en retard », « dans 3 h », « demain »…). */
  texte: string;
  statut: 'neutral' | 'soon' | 'overdue';
}

export interface TacheVue {
  id: string;
  titre: string;
  /** Créée par un agent : la page pose la pastille « agent », comme l'app. */
  agent: boolean;
  echeance: EcheanceVue | null;
}

export interface CaseVue {
  key: QuadrantKey;
  label: string;
  /** Le nombre EXACT de tâches ouvertes, même quand la liste est tronquée. */
  ouvertes: number;
  taches: TacheVue[];
  /** Combien de lignes n'ont pas été montrées. */
  reste: number;
  /** Case hors du filtre demandé : la page l'affiche en retrait, sans chiffre. */
  masquee: boolean;
  /** Le libellé accessible de la région, déjà accordé. */
  aria: string;
}

export interface VueMatrice {
  vue: 'matrice';
  /** Lien « Ouvrir » vers l'app web, ou `null` si aucune URL n'est configurée. */
  lien: string | null;
  /** « Penduline · Maison », ou « Penduline » pour une matrice hors univers. */
  surtitre: string;
  matrice: string;
  cases: CaseVue[];
  parking: CaseVue;
  /** « 7 tâches ouvertes · 1 en retard ». */
  pied: string;
  /** Instant de lecture, en ISO : la page le formate dans le fuseau de l'hôte. */
  luA: string;
}

export interface MatriceResumee {
  id: string;
  nom: string;
  comptes: Record<QuadrantKey, number>;
  ouvertes: number;
  enRetard: number;
  /** « 1 en retard », « 5 tâches » ou « vide ». */
  meta: string;
  /** Vrai si `meta` annonce un retard : la page le passe en couleur d'alerte. */
  alerte: boolean;
  /** « Faire 2, Planifier 2, Déléguer 1, Éliminer 1, À trier 0 ». */
  aria: string;
}

export interface VueMatrices {
  vue: 'matrices';
  lien: string | null;
  /**
   * `horsUnivers` plutôt qu'une comparaison sur le nom : un univers que
   * l'utilisateur aurait LUI-MÊME appelé « Sans univers » ne doit pas être
   * décompté du pied.
   */
  groupes: { nom: string; horsUnivers: boolean; matrices: MatriceResumee[] }[];
  /** « 4 matrices · 2 univers · 19 tâches ouvertes ». */
  pied: string;
}

export interface CaseRef {
  key: QuadrantKey;
  label: string;
}

/** Les cartes de confirmation des écritures. */
export type VueEcriture = {
  vue: 'ecriture';
  lien: string | null;
  titre: string;
  /** « Maison › Cuisine ». */
  chemin: string;
} & (
  | {
      type: 'ajout';
      case: CaseRef;
      /** « Ajoutée dans Faire », ou « Étape de « Parent » · Faire ». */
      surtitre: string;
      agent: boolean;
      echeance: EcheanceVue | null;
    }
  | {
      type: 'deplacement';
      de: CaseRef;
      vers: CaseRef;
      /** Le titre de la partenaire, si une paire a suivi. */
      paire: string | null;
    }
  | {
      type: 'terminee';
      case: CaseRef;
      /** « était en retard d'un jour », ou `null`. */
      retard: string | null;
      /** La partenaire laissée seule quand la paire se défait. */
      paireDefaite: { titre: string; case: CaseRef } | null;
    }
  | {
      type: 'modification';
      case: CaseRef;
      surtitre: string;
      echeance: EcheanceVue | null;
    }
);

export type Vue = VueMatrice | VueMatrices | VueEcriture;

// ── Petits outils ────────────────────────────────────────────────────────────

const CASES_GRILLE: CaseGrille[] = QUADS.map((q) => q.key as CaseGrille);

/**
 * « 0 tâche », « 1 tâche », « 2 tâches » : en français, le singulier vaut
 * jusqu'à deux exclu — zéro compris, à la différence de l'anglais.
 */
export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${n} ${Math.abs(n) < 2 ? singulier : plurielForme}`;
}

const ref = (key: QuadrantKey): CaseRef => ({ key, label: laCase(key).label });

/**
 * Le lien vers l'app, seulement s'il est en `http(s)`.
 *
 * La page le pose dans un `href` : une valeur de configuration fautive
 * (`javascript:…`) deviendrait sinon un lien exécutable dans l'hôte. `env.ts`
 * valide déjà le protocole au démarrage — ceci n'est qu'une seconde ceinture,
 * pour les appelants qui n'en passent pas par lui (les tests, un futur outil).
 */
export function lienApp(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function echeanceVue(dueAt: string | null, now: number): EcheanceVue | null {
  const statut = deadlineStatus(dueAt, now);
  if (!statut || !dueAt) return null;
  return { texte: formatDeadline(dueAt, now), statut };
}

function tacheVue(t: Task, now: number): TacheVue {
  return {
    id: t.id,
    titre: t.title,
    agent: t.origin === 'agent',
    echeance: echeanceVue(t.due_at, now),
  };
}

/** « Maison › Cuisine », ou « Cuisine » tout court hors univers. */
export function chemin(matrice: string, univers: string | null | undefined): string {
  return univers ? `${univers} › ${matrice}` : matrice;
}

// ── La matrice (list_tasks) ──────────────────────────────────────────────────

export interface EntreeMatrice {
  board: { id: string; name: string };
  universe: { name: string } | null;
  /** Ce que `list_tasks` a rendu — `tout` compris : le tri des ouvertes se fait ici. */
  taches: Task[];
  /** Le filtre `quadrant` de l'appel, s'il y en avait un. */
  filtre?: QuadrantKey;
  lien?: string | null;
}

/**
 * Le modèle de la vue « matrice ».
 *
 * L'ORDRE est celui de l'app, et il vient de `packages/shared` : les lignes en
 * retard d'abord (`splitOverdue`), puis les autres par position, et une paire
 * reste d'un seul tenant (`buildRows`). Aplatir les lignes ensuite garde les
 * deux moitiés d'une paire côte à côte dans la liste.
 *
 * Les tâches cochées, supprimées et les étapes ne sont jamais montrées, même
 * quand l'appel portait `tout: true` : la grille de l'app ne les montre pas
 * non plus, et un compteur qui les inclurait mentirait.
 */
export function vueMatrice(e: EntreeMatrice, now: number = Date.now()): VueMatrice {
  const zone = (key: QuadrantKey, max: number): CaseVue => {
    const masquee = !!e.filtre && e.filtre !== key;
    const { overdue, rest } = splitOverdue(buildRows(visibleTasks(e.taches, e.board.id, key)), now);
    const toutes = [...overdue, ...rest].flat();
    const label = laCase(key).label;
    return {
      key,
      label,
      ouvertes: toutes.length,
      taches: toutes.slice(0, max).map((t) => tacheVue(t, now)),
      reste: Math.max(0, toutes.length - max),
      masquee,
      aria: masquee ? `${label}, non lue` : `${label}, ${pluriel(toutes.length, 'tâche')}`,
    };
  };

  const cases = CASES_GRILLE.map((k) => zone(k, LIGNES_PAR_CASE));
  const parking = zone('parking', PASTILLES_PARKING);

  const ouvertes = e.taches.filter((t) => t.board_id === e.board.id && isOpenRow(t));
  const enRetard = ouvertes.filter((t) => deadlineStatus(t.due_at, now) === 'overdue').length;

  const morceaux = [
    pluriel(ouvertes.length, 'tâche ouverte', 'tâches ouvertes') +
      (e.filtre ? ` dans ${laCase(e.filtre).label}` : ''),
  ];
  if (enRetard) morceaux.push(`${enRetard} en retard`);

  return {
    vue: 'matrice',
    lien: lienApp(e.lien),
    surtitre: e.universe ? `Penduline · ${e.universe.name}` : 'Penduline',
    matrice: e.board.name,
    cases,
    parking,
    pied: morceaux.join(' · '),
    luA: new Date(now).toISOString(),
  };
}

// ── Vos matrices (list_boards) ───────────────────────────────────────────────

export interface EntreeMatrices {
  /** Ce que `list_boards` a rendu, dans son ordre. */
  boards: BoardRange[];
  universes: Universe[];
  /** Les tâches de ces matrices, toutes lignes confondues. */
  taches: Task[];
  lien?: string | null;
}

/** Le nom du groupe des matrices rangées nulle part — c'est aussi celui de l'app. */
export const SANS_UNIVERS = 'Sans univers';

/**
 * Le modèle de la vue « vos matrices » : un groupe par univers, dans l'ordre
 * des univers, et les matrices hors univers à la fin.
 *
 * Un univers SANS matrice n'apparaît pas : un titre suivi de rien serait du
 * bruit, pour la même raison que `groupTasksByBoard` saute les cadres vides.
 * Une matrice rangée dans un univers qu'on ne retrouve pas (donnée incohérente,
 * ou univers d'un autre compte sur une matrice partagée) tombe dans « Sans
 * univers » plutôt que de disparaître.
 */
export function vueMatrices(e: EntreeMatrices, now: number = Date.now()): VueMatrices {
  const resume = (b: BoardRange): MatriceResumee => {
    const ouvertes = e.taches.filter((t) => t.board_id === b.id && isOpenRow(t));
    const comptes = { faire: 0, planifier: 0, deleguer: 0, eliminer: 0, parking: 0 } as Record<
      QuadrantKey,
      number
    >;
    for (const t of ouvertes) comptes[t.quadrant] = (comptes[t.quadrant] ?? 0) + 1;
    const enRetard = ouvertes.filter((t) => deadlineStatus(t.due_at, now) === 'overdue').length;
    const meta = enRetard
      ? `${enRetard} en retard`
      : ouvertes.length
        ? pluriel(ouvertes.length, 'tâche')
        : 'vide';
    return {
      id: b.id,
      nom: b.name,
      comptes,
      ouvertes: ouvertes.length,
      enRetard,
      meta,
      alerte: enRetard > 0,
      aria: (['faire', 'planifier', 'deleguer', 'eliminer', 'parking'] as QuadrantKey[])
        .map((k) => `${laCase(k).label} ${comptes[k]}`)
        .join(', '),
    };
  };

  const connus = new Set(e.universes.map((u) => u.id));
  const groupes: VueMatrices['groupes'] = [];
  for (const u of [...e.universes].sort((a, b) => a.position - b.position)) {
    const matrices = e.boards.filter((b) => b.universe_id === u.id).map(resume);
    if (matrices.length) groupes.push({ nom: u.name, horsUnivers: false, matrices });
  }
  const orphelines = e.boards
    .filter((b) => !b.universe_id || !connus.has(b.universe_id))
    .map(resume);
  if (orphelines.length) groupes.push({ nom: SANS_UNIVERS, horsUnivers: true, matrices: orphelines });

  const toutes = groupes.flatMap((g) => g.matrices);
  const morceaux = [pluriel(toutes.length, 'matrice')];
  // « 0 univers » n'apprend rien à personne : on ne le dit que s'il y en a.
  const nbUnivers = groupes.filter((g) => !g.horsUnivers).length;
  if (nbUnivers) morceaux.push(pluriel(nbUnivers, 'univers', 'univers'));
  morceaux.push(
    pluriel(
      toutes.reduce((n, m) => n + m.ouvertes, 0),
      'tâche ouverte',
      'tâches ouvertes',
    ),
  );

  return { vue: 'matrices', lien: lienApp(e.lien), groupes, pied: morceaux.join(' · ') };
}

// ── Les écritures ────────────────────────────────────────────────────────────

export interface Emplacement {
  matrice: string;
  univers: string | null;
}

/** create_task : la tâche créée, et l'étape éventuelle. */
export function vueAjout(
  e: { tache: Task; ou: Emplacement; parent?: Task | null; lien?: string | null },
  now: number = Date.now(),
): VueEcriture {
  const c = ref(e.tache.quadrant);
  return {
    vue: 'ecriture',
    type: 'ajout',
    lien: lienApp(e.lien),
    titre: e.tache.title,
    chemin: chemin(e.ou.matrice, e.ou.univers),
    case: c,
    surtitre: e.parent ? `Étape de « ${e.parent.title} »` : `Ajoutée dans ${c.label}`,
    agent: e.tache.origin === 'agent',
    echeance: echeanceVue(e.tache.due_at, now),
  };
}

/** update_task : même carte que l'ajout, sans la pastille « agent ». */
export function vueModification(
  e: { tache: Task; ou: Emplacement; lien?: string | null },
  now: number = Date.now(),
): VueEcriture {
  const c = ref(e.tache.quadrant);
  return {
    vue: 'ecriture',
    type: 'modification',
    lien: lienApp(e.lien),
    titre: e.tache.title,
    chemin: chemin(e.ou.matrice, e.ou.univers),
    case: c,
    surtitre: `Modifiée · ${c.label}`,
    echeance: echeanceVue(e.tache.due_at, now),
  };
}

/** La partenaire touchée par une écriture de paire : l'AUTRE id des writes. */
function partenaire(writes: TaskWrite[], tache: Task, taches: Task[]): Task | null {
  const autre = writes.find((w) => w.id !== tache.id);
  return (autre && taches.find((t) => t.id === autre.id)) || null;
}

/**
 * move_task : d'où, vers où, et la partenaire si elle a suivi.
 *
 * `avant` est la tâche telle que lue AVANT le déplacement : c'est elle qui sait
 * d'où l'on part. La destination se lit sur le write de la tâche elle-même —
 * celui que `planPairMove` a calculé, donc la seule source qui ne puisse pas
 * diverger de ce qui a été écrit.
 */
export function vueDeplacement(e: {
  avant: Task;
  writes: TaskWrite[];
  taches: Task[];
  ou: Emplacement;
  /** L'emplacement de départ, seulement si la tâche a changé de matrice. */
  depart?: Emplacement | null;
  lien?: string | null;
}): VueEcriture {
  const patch = e.writes.find((w) => w.id === e.avant.id)?.patch ?? {};
  const vers = (patch.quadrant as QuadrantKey | undefined) ?? e.avant.quadrant;
  const p = partenaire(e.writes, e.avant, e.taches);
  const arrivee = chemin(e.ou.matrice, e.ou.univers);
  return {
    vue: 'ecriture',
    type: 'deplacement',
    lien: lienApp(e.lien),
    titre: e.avant.title,
    chemin: e.depart ? `${chemin(e.depart.matrice, e.depart.univers)} → ${arrivee}` : arrivee,
    de: ref(e.avant.quadrant),
    vers: ref(vers),
    paire: p?.title ?? null,
  };
}

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;

/**
 * « était en retard d'un jour » — dit au moment où l'on coche.
 *
 * Le libellé de l'app (`formatDeadline`) dit seulement « en retard » : c'est ce
 * qu'il faut sur une carte encore ouverte, où l'urgence compte plus que la
 * durée. Sur une carte qu'on vient de fermer, la durée est l'information.
 */
export function retardALaCloture(dueAt: string | null, now: number = Date.now()): string | null {
  if (deadlineStatus(dueAt, now) !== 'overdue' || !dueAt) return null;
  const ecart = now - Date.parse(dueAt);
  if (ecart < HEURE) return 'était tout juste en retard';
  if (ecart < JOUR) return `était en retard de ${Math.floor(ecart / HEURE)} h`;
  const jours = Math.floor(ecart / JOUR);
  return jours === 1 ? 'était en retard d’un jour' : `était en retard de ${jours} jours`;
}

/** complete_task : la tâche terminée, et la partenaire laissée seule. */
export function vueTerminee(
  e: { avant: Task; writes: TaskWrite[]; taches: Task[]; ou: Emplacement; lien?: string | null },
  now: number = Date.now(),
): VueEcriture {
  const p = partenaire(e.writes, e.avant, e.taches);
  return {
    vue: 'ecriture',
    type: 'terminee',
    lien: lienApp(e.lien),
    titre: e.avant.title,
    chemin: chemin(e.ou.matrice, e.ou.univers),
    case: ref(e.avant.quadrant),
    retard: retardALaCloture(e.avant.due_at, now),
    paireDefaite: p ? { titre: p.title, case: ref(p.quadrant) } : null,
  };
}
