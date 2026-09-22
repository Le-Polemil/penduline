import type { QuadrantKey } from './quadrants';

/**
 * Qui a créé cette ligne (#23).
 *
 * Un enum et non un booléen `created_by_agent` : les deux valeurs d'aujourd'hui
 * ne sont pas celles de toujours. Un import ou une récurrence en demanderaient
 * une troisième, qu'un booléen ne saurait pas porter.
 *
 * Toujours renseigné — la base pose `'user'` par défaut, l'application n'écrit
 * donc jamais cette colonne.
 */
export type Origin = 'user' | 'agent';

/**
 * Un regroupement de matrices — Perso, Boulot, Maison…
 *
 * Facultatif de bout en bout : on peut n'en créer aucun, et une matrice peut
 * n'appartenir à aucun univers. C'est un état normal, pas un oubli à corriger.
 */
export interface Universe {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
  origin: Origin;
}

/**
 * Une matrice. Le découpage est libre : un lieu, un moment de la journée, un
 * projet… Chaque matrice porte ses tâches directement.
 *
 * ⚠️ **Elle ne porte plus son rangement** (#53). `universe_id` et `position` ont
 * déménagé dans `BoardPlacement`, parce qu'une matrice partagée est rangée
 * DIFFÉREMMENT par chaque personne, et que les univers restent privés.
 */
export interface Board {
  id: string;
  /** Le PROPRIÉTAIRE — celui qui peut la renommer, la supprimer, la partager. */
  user_id: string;
  name: string;
  created_at: string;
  origin: Origin;
}

/** Lecture seule, ou écriture sur le contenu (#53). */
export type BoardRole = 'lecture' | 'ecriture';

/**
 * Quelqu'un à qui une matrice a été ouverte (#53).
 *
 * ⚠️ Le propriétaire n'y figure PAS : `Board.user_id` reste l'autorité. Deux
 * représentations du même fait finissent toujours par diverger.
 */
export interface BoardMember {
  board_id: string;
  user_id: string;
  role: BoardRole;
  /** `null` si le compte qui a invité a depuis été supprimé. */
  invited_by: string | null;
  created_at: string;
}

/**
 * Où CETTE personne range CETTE matrice (#53).
 *
 * Une ligne par (matrice, personne). Mono-utilisateur par construction : c'est
 * ce qui permet à l'invité de classer une matrice partagée dans SES univers sans
 * rien déplacer chez les autres, et ce qui garde la policy et le filtre temps
 * réel de cette table triviaux.
 */
export interface BoardPlacement {
  board_id: string;
  user_id: string;
  /** `null` = pas rangée dans un univers. Un état normal. */
  universe_id: string | null;
  position: number;
}

/**
 * Une matrice telle que l'accueil l'affiche : la matrice, et SON rangement.
 *
 * Assemblée à la volée par le store, jamais lue telle quelle : deux tables la
 * composent. Ce type existe pour que les écrans continuent de recevoir un objet
 * unique, comme avant #53.
 */
export interface BoardRange extends Board {
  universe_id: string | null;
  position: number;
  /** `null` si on est le propriétaire ; le rôle reçu sinon. */
  role: BoardRole | null;
  /** Raccourci de lecture : `role !== null`. */
  partagee: boolean;
}

/**
 * Une invitation en attente (#53). Ce que le PROPRIÉTAIRE en voit — l'invité,
 * lui, n'a aucun droit de lecture sur cette table.
 *
 * ⚠️ Pas de jeton : la base n'en garde que le hachage, et le clair ne sort
 * qu'une fois, dans le retour de `creer_invitation`.
 */
export interface Invitation {
  id: string;
  board_id: string;
  /** Un LIBELLÉ mnémotechnique, jamais une autorité. C'est le jeton qui fait foi. */
  email: string | null;
  role: BoardRole;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

/**
 * Quelqu'un qui a accès à une matrice, avec son adresse (#53).
 *
 * Rendu par la RPC `membres_matrice` et non lu dans une table : les adresses
 * vivent dans `auth.users`, fermé à l'application. Le propriétaire y figure,
 * marqué, bien qu'il ne soit pas dans `board_members`.
 */
export interface Membre {
  user_id: string;
  /** `null` si le compte a été supprimé depuis. */
  email: string | null;
  /** `null` pour le propriétaire — il n'a pas de rôle, il a la matrice. */
  role: BoardRole | null;
  proprietaire: boolean;
}

/** Ce que l'écran d'acceptation affiche — rendu par le SERVEUR, pas lu dans l'URL. */
export interface InvitationLue {
  board_name: string;
  /** L'adresse de qui invite. `null` si le compte a été supprimé depuis. */
  invited_by: string | null;
  role: BoardRole;
  expires_at: string;
  /** Déjà propriétaire ou déjà membre : l'écran propose d'ouvrir, pas de rejoindre. */
  deja_accessible: boolean;
}

/** Un élément placé dans une case d'une matrice. */
export interface Task {
  id: string;
  /**
   * QUI A ÉCRIT cette ligne — pas qui la possède (#53).
   *
   * La propriété est celle de la MATRICE (`Board.user_id`). Cette colonne ne
   * sert à aucune policy : l'accès passe par `board_id`. Elle ne sert qu'à
   * afficher « par Alice » sur une matrice partagée.
   */
  author_id: string;
  board_id: string;
  title: string;
  quadrant: QuadrantKey;
  /** Cochée (part vers la corbeille « Terminées » après le délai d'annulation). */
  done: boolean;
  /** Terminée et archivée (visible seulement dans la corbeille). */
  archived: boolean;
  /** Supprimée (visible seulement dans la corbeille « Supprimées »). */
  deleted: boolean;
  /** Ordre dans (board, quadrant). Fractionnaire pour insérer entre deux voisins. */
  position: number;
  /** Deux tâches partageant un `pair_id` s'affichent côte à côte (une ligne). */
  pair_id: string | null;
  /**
   * La tâche dont celle-ci est une étape. `null` = tâche de premier niveau.
   *
   * UN SEUL niveau : une sous-tâche ne peut pas en avoir, et la base le garantit
   * par un trigger. Une sous-tâche n'a pas non plus de case propre — son
   * classement urgent/important appartient à son parent (#50).
   */
  parent_id: string | null;
  /**
   * Échéance, en UTC (#19). `null` = pas de date, l'état de très loin le plus
   * courant — la matrice reste utilisable sans jamais en poser une.
   *
   * Aucun statut n'accompagne cette colonne : « bientôt » et « dans le rouge »
   * se déduisent d'elle et de l'heure courante à chaque rendu
   * (`deadlineStatus`). Les stocker obligerait quelqu'un à les réécrire au fil
   * du temps, et personne ne tourne côté serveur.
   */
  due_at: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Le jour pour lequel la tâche a été choisie (#49). `null` = hors sélection.
   *
   * Date LOCALE, écrite par le client, jamais convertie par la base. La
   * sélection n'expire pas : elle cesse de correspondre au jour courant. Et la
   * valeur de la veille survit exprès — c'est elle qui permet le bilan du soir.
   */
  focus_day: string | null;
  /**
   * Dernier changement de CASE — et rien d'autre (#47).
   *
   * `updated_at` ne pouvait pas jouer ce rôle : son trigger l'écrase à chaque
   * update, quelle que soit la colonne touchée. Une tâche renommée et une tâche
   * déplacée y sont indiscernables, or la revue doit signaler la première et
   * taire la seconde.
   *
   * ⚠️ Ne dit rien de l'avant-migration : l'existant a été initialisé à la date
   * de migration, pas à `created_at`. Une tâche déplacée la veille rapporte donc
   * « changée à la migration ». C'est délibéré — remplir avec `created_at`
   * aurait fait passer pour oubliée toute tâche jamais déplacée, ce qui est un
   * faux positif, quand ceci n'est qu'une absence.
   */
  quadrant_changed_at: string;
  /**
   * L'instant du cochage. `null` = pas cochée, y compris après restauration.
   *
   * ⚠️ Ne pas confondre avec ses deux voisines, elles répondent à trois
   * questions différentes :
   *
   *   updated_at           dernière modification, QUELLE QU'ELLE SOIT
   *   quadrant_changed_at  dernier changement de CASE (#47)
   *   completed_at         moment où la tâche a quitté la grille
   *
   * `updated_at` ne pouvait pas jouer ce rôle — c'est le même raisonnement
   * qu'en #47 : son trigger l'écrase à chaque update, donc renommer une tâche
   * déjà rangée la ferait remonter en tête d'une corbeille qui prétend classer
   * par date de cochage.
   *
   * Tenue par trigger, jamais écrite par un client : elle est donc absente de
   * `TaskPatch`. Décocher la remet à `null` toute seule.
   */
  completed_at: string | null;
  /**
   * Qui a coché (#53). `null` = pas cochée, ou cochée avant que la colonne
   * n'existe et par un compte depuis supprimé.
   *
   * Tenue par le MÊME trigger que `completed_at`, et effacée avec elle au
   * décochage : les deux répondent à la même transition et ne doivent jamais
   * diverger. Absente de `TaskPatch` pour la même raison.
   */
  completed_by: string | null;
  origin: Origin;
}

/**
 * Colonnes modifiables d'une tâche (le reste est géré par la base).
 *
 * `board_id` en fait partie : une tâche peut changer de matrice. Sa `position`
 * doit alors être recalculée sur la cible, l'ordre étant scopé à
 * `(board_id, quadrant)`.
 */
export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'board_id'
    | 'quadrant'
    | 'done'
    | 'archived'
    | 'deleted'
    | 'position'
    | 'pair_id'
    | 'parent_id'
    | 'due_at'
    /** Entrer dans la sélection du jour, ou en sortir (#49). */
    | 'focus_day'
    /**
     * Jamais écrit en avant — la base le tient elle-même par trigger. Il n'est
     * ici que pour l'INVERSE d'annulation : une annulation étant elle-même un
     * changement de case, le trigger y remettrait `now()` et `Ctrl+Z` rendrait
     * la tâche à sa case sans lui rendre son ancienneté (#47).
     */
    | 'quadrant_changed_at'
  >
>;

/**
 * Un lien attaché à une tâche (#78).
 *
 * Une tâche en porte PLUSIEURS — une issue et sa PR, un article et sa
 * discussion. Une colonne unique obligerait à choisir lequel compte.
 */
export interface Attachment {
  id: string;
  task_id: string;
  /** Qui a attaché ce lien. Même sens que `Task.author_id`, aucun rôle en policy. */
  author_id: string;
  /**
   * La matrice dont relève la tâche, DÉNORMALISÉE (#53).
   *
   * Pas une commodité : un filtre temps réel ne sait pas joindre — c'est une
   * chaîne évaluée sur la ligne telle qu'elle voyage — et pour les DELETE il est
   * la seule barrière. Tenue par trigger, y compris quand la tâche change de
   * matrice.
   */
  board_id: string;
  /**
   * Toujours `http(s)` : la base le vérifie par un `check`, et pas seulement le
   * champ de saisie. Un `javascript:` entré par l'API finirait cliquable.
   */
  url: string;
  /** `null` = pas de nom donné ; l'interface affiche alors le domaine. */
  label: string | null;
  position: number;
  created_at: string;
}
