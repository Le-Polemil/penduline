import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  deadlineStatus,
  formatDeadline,
  groupByUniverse,
  partnerOf,
  QUADS,
  type Attachment,
  type BoardRange,
  type Quadrant,
  type QuadrantKey,
  type Task,
  type Universe,
} from '@penduline/shared';
import {
  IconAlarmClock,
  IconFlag,
  IconLayersPlus,
  IconPaperclip,
  IconPenLine,
  IconTrash,
} from './Icons';
import { useTitreDepliable } from '../data/useTitreDepliable';
import { LARGEUR_ACTION, useBalayage, usePointeurFin, useTelephone } from '../data/useBalayage';
import { Attachments } from './Attachments';
import { Deadline } from './Deadline';
import { Subtasks } from './Subtasks';
import { OriginBadge } from './OriginBadge';

/** Le déplacement au doigt/à la souris. Absent, la carte n'est pas déplaçable. */
export interface CardDrag {
  /** Cette carte est celle qu'on déplace. */
  dragging: boolean;
  start: () => void;
  end: () => void;
}

/**
 * L'appairage par dépôt sur la carte. Absent, la carte n'est jamais une cible.
 *
 * La vue globale s'en passe : appairer suppose de poser la nouvelle venue juste
 * après sa partenaire, donc un ordre — et il n'en existe pas entre deux matrices.
 */
export interface CardSplit {
  ok: boolean;
  active: boolean;
  over: () => void;
  drop: () => void;
}

/**
 * Le réordonnancement d'un cran. Absent, la fonction n'existe pas — c'est ainsi
 * que la vue globale s'en passe, où aucun ordre transversal n'a de sens (#18).
 *
 * `null` sur un côté = déjà en bout de liste. Porter la borne dans la prop évite
 * que chaque écran redécouvre « suis-je en haut » alors que `planReorder` le sait.
 */
export interface CardReorder {
  up: (() => void) | null;
  down: (() => void) | null;
}

/**
 * L'engagement du jour (#49). Absent, le geste n'existe pas — comme `drag`.
 *
 * `refusal` porte la RAISON d'un refus au lieu d'un simple booléen : l'entrée se
 * désactive en affichant son motif, plutôt que de disparaître. Un blocage muet se
 * lit comme un bug, un blocage expliqué se lit comme une intention.
 */
export interface CardFocus {
  /** La tâche est-elle déjà dans la sélection du jour ? */
  on: boolean;
  /** `null` = on peut ajouter. Sinon, le motif à afficher. Ignoré si `on`. */
  refusal: string | null;
  toggle: () => void;
}

/** Le renommage en place, dont l'état vit chez l'appelant (une seule carte à la fois). */
export interface CardRename {
  /** `null` = titre affiché ; une chaîne = saisie en cours. */
  value: string | null;
  start: () => void;
  change: (value: string) => void;
  cancel: () => void;
  commit: () => void;
}

/**
 * Une carte de tâche et son menu `⋯`.
 *
 * Extraite de l'écran matrice pour que la vue globale ne la recopie pas. La
 * différence entre les deux écrans tient entièrement dans deux props
 * FACULTATIVES — `drag` et `split` : absentes, les gestes correspondants
 * n'existent tout simplement pas. Pas de drapeau `mode`, donc pas de
 * conditionnelle à maintenir à l'intérieur.
 */
export function TaskCard({
  task,
  quad,
  tasks,
  otherBoards,
  universes,
  menuOpen,
  onMenu,
  swipeOpen = false,
  onSwipe,
  paired = false,
  rename,
  onCheck,
  onMoveQuad,
  onMoveBoard,
  onUnpair,
  onDelete,
  focus,
  drag,
  split,
  reorder,
  flash,
  subtasks,
  attachments,
  deadline,
}: {
  task: Task;
  quad: Quadrant;
  /** Toutes les tâches — pour savoir si la partenaire existe encore (« Dissocier »). */
  tasks: Task[];
  /** Les matrices proposées par « Vers une autre matrice » (la sienne exclue). */
  otherBoards: BoardRange[];
  /**
   * Les univers, pour ranger les matrices comme l'accueil le fait (#62).
   *
   * Facultatif : absent — ou vide — la liste reste PLATE, exactement celle
   * d'aujourd'hui. C'est l'état de tout compte qui n'a pas rangé ses matrices,
   * et il ne doit pas se compliquer pour rien.
   */
  universes?: Universe[];
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  /**
   * Le bandeau d'actions révélé au balayage est-il ouvert ? (#89)
   *
   * Même forme que `menuOpen` / `onMenu`, et pour la même raison : une seule
   * carte ouverte à la fois sur tout l'écran, donc l'état vit chez l'écran.
   *
   * Facultatif : sans `onSwipe`, le geste n'est pas monté — un hôte qui n'en veut
   * pas (le panneau d'extension) n'a rien à câbler.
   */
  swipeOpen?: boolean;
  onSwipe?: (open: boolean) => void;
  /**
   * Cette carte partage-t-elle sa ligne avec sa partenaire ? (#92)
   *
   * Une paire ne dispose que d'une demi-case : à 1440 px comme à 2560, les deux
   * titres tombaient à ~80 px et affichaient « [AUDIT]… ». La carte appairée perd
   * donc sa poignée — c'est la PAIRE qui se déplace d'un bloc, la poignée
   * individuelle promettait un geste faux — et ses deux raccourcis, qui restent
   * dans son `⋯`. ~170 px de titre au lieu de 80, sans sacrifier la lecture côte à
   * côte, qui est tout l'intérêt de la paire.
   */
  paired?: boolean;
  rename: CardRename;
  onCheck: () => void;
  onMoveQuad: (key: QuadrantKey) => void;
  onMoveBoard: (board: BoardRange) => void;
  onUnpair: () => void;
  onDelete: () => void;
  /** Absent = la carte ne propose pas l'engagement du jour (#49). */
  focus?: CardFocus;
  drag?: CardDrag;
  split?: CardSplit;
  /** Absent = ni entrées de menu, ni raccourci. */
  reorder?: CardReorder;
  /** Mise en évidence passagère, à l'arrivée depuis la recherche. */
  flash?: boolean;
  /**
   * Les étapes de cette tâche. Absent = la carte n'en affiche aucune.
   *
   * Facultatif comme `drag`, `split` et `reorder` : la vue globale ne les montre
   * pas — elle agrège des matrices, pas des plans d'action.
   */
  subtasks?: {
    open: boolean;
    onToggleOpen: () => void;
    onAdd: (title: string, position: number) => void;
    onCheck: (t: Task) => void;
    onDelete: (t: Task) => void;
  };
  /**
   * Les liens de cette tâche (#78). Absent = la carte n'en affiche aucun.
   *
   * Comme `subtasks`, facultatif : la vue globale s'en passe. `adding` vit chez
   * l'appelant parce qu'un seul champ doit être ouvert à la fois, tout l'écran
   * confondu — la même règle que le renommage.
   */
  attachments?: {
    all: Attachment[];
    adding: boolean;
    onStartAdd: () => void;
    onCancelAdd: () => void;
    onAdd: (url: string) => Promise<boolean>;
    onRemove: (a: Attachment) => void;
  };
  /**
   * L'échéance de cette tâche (#19). Absent = ni badge ni entrée de menu.
   *
   * `now` est FOURNI par l'appelant plutôt que relu ici : le statut doit se
   * rafraîchir tout seul (l'app reste ouverte des heures), et c'est l'écran qui
   * tient le minuteur — une carte qui lirait `Date.now()` au rendu resterait
   * figée jusqu'au prochain rendu déclenché par autre chose.
   */
  deadline?: {
    now: number;
    editing: boolean;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSet: (dueAt: string) => void;
    onClear: () => void;
  };
}) {
  /**
   * Nonce d'ajout d'étape, incrémenté à chaque clic sur le bouton dédié.
   *
   * Un compteur et non un booléen : deux clics de suite doivent redonner le
   * focus au champ, même quand la liste est déjà ouverte — un booléen resterait
   * à `true` et le second clic ne déclencherait rien.
   */
  const [askAdd, setAskAdd] = useState(0);
  /** L'univers dont le sous-menu est ouvert. `null` = aucun. */
  const [openUni, setOpenUni] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  /** Lire un titre tronqué d'un clic (#95). Voir le hook pour les trois pièges. */
  const titre = useTitreDepliable(task.title);


  /**
   * Fermer le menu au clic à côté.
   *
   * Il ne se refermait que par un de ses propres boutons : ouvert par erreur, il
   * fallait choisir une action pour s'en débarrasser. `pointerdown` et non
   * `click`, pour qu'il disparaisse dès l'appui — attendre le relâchement le
   * laisse visible pendant tout un glisser.
   */
  useEffect(() => {
    if (!menuOpen) return;
    function dehors(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) onMenu(false);
    }
    document.addEventListener('pointerdown', dehors);
    return () => document.removeEventListener('pointerdown', dehors);
  }, [menuOpen, onMenu]);
  /**
   * Les matrices d'accueil, rangées par univers et débarrassées des groupes
   * vides. `groupByUniverse` place déjà le groupe « sans univers » en dernier.
   */
  const groupes = groupByUniverse(universes ?? [], otherBoards).filter((g) => g.boards.length > 0);
  const renaming = rename.value !== null;
  const splitActive = !!split?.ok && !!split.active;
  const statut = deadline ? deadlineStatus(task.due_at, deadline.now) : null;

  /**
   * Le bandeau d'actions du téléphone (#89).
   *
   * Sous 720 px, les trois commandes quittent la carte — elles y prenaient 88 px
   * sur 306, plus que le titre — et se rangent derrière elle. Le bandeau n'a que
   * les boutons dont la prop existe : `Focus` et `Review` n'en passent pas
   * autant que la matrice, et obtiennent un bandeau plus court sans conditionnelle
   * supplémentaire.
   */
  const telephone = useTelephone();
  /* Le survol piloté en JS — le sous-menu d'univers — ne se MONTE que sur un
     pointeur fin (#90). Au doigt, `mouseenter` est bien synthétisé par le
     navigateur, mais il se superpose alors au clic qui sert déjà de repli : deux
     chemins concurrents pour un seul geste. On n'en monte qu'un. */
  const pointeurFin = usePointeurFin();
  const actionsBandeau = telephone ? [subtasks, focus, deadline].filter(Boolean).length : 0;
  const bandeau = !!onSwipe && actionsBandeau > 0 && !renaming;
  const largeurBandeau = actionsBandeau * LARGEUR_ACTION;
  const balayage = useBalayage(
    swipeRef,
    bandeau,
    swipeOpen,
    onSwipe ?? (() => {}),
    largeurBandeau,
  );

  /**
   * Refermer le bandeau au contact d'ailleurs — même règle et même écouteur que
   * le menu `⋯` juste en dessous : `pointerdown` et non `click`, pour qu'il
   * disparaisse dès l'appui.
   */
  useEffect(() => {
    if (!swipeOpen || !onSwipe) return;
    function dehors(e: PointerEvent) {
      if (!swipeRef.current?.contains(e.target as Node)) onSwipe?.(false);
    }
    document.addEventListener('pointerdown', dehors);
    return () => document.removeEventListener('pointerdown', dehors);
  }, [swipeOpen, onSwipe]);
  /**
   * Les commandes de la carte, construites UNE fois et posées à un seul endroit.
   *
   * Au-dessus de 720 px elles restent sur la carte, révélées au survol comme
   * avant. En dessous elles passent dans le bandeau, où elles font 44 px. Les
   * rendre aux deux endroits en laissant le CSS en masquer un donnerait deux
   * boutons de même nom accessible par tâche — un lecteur d'écran les annoncerait
   * tous les deux.
   *
   * L'échéance n'existe QUE dans le bandeau : sur la carte, elle reste une entrée
   * du menu `⋯`, où le survol ne coûte rien.
   */
  const classeCommande = telephone ? 'task-swipe__act' : 'task__act';
  /* Fermé, le bandeau ne doit rien ajouter au parcours clavier — déjà dense d'un
     arrêt par contrôle et par tâche. */
  const horsTab = bandeau && !swipeOpen ? -1 : undefined;
  const tailleIcone = telephone ? 18 : 14;

  const btnEtape = subtasks && (
    <button
      key="etape"
      className={classeCommande}
      tabIndex={horsTab}
      aria-label={`Ajouter une étape à « ${task.title} »`}
      onClick={() => {
        if (!subtasks.open) subtasks.onToggleOpen();
        // Un compteur plutôt qu'un booléen : deux clics de suite doivent
        // redonner le focus au champ, même s'il est déjà ouvert.
        setAskAdd((n) => n + 1);
        onSwipe?.(false);
      }}
    >
      <IconLayersPlus size={tailleIcone} />
    </button>
  );

  const btnAujourdhui = focus && (
    <button
      key="aujourdhui"
      className={`${classeCommande} task__today${focus.on ? ' task__today--on' : ''}`}
      tabIndex={horsTab}
      aria-pressed={focus.on}
      // Le motif du refus sert d'infobulle : le bouton ne disparaît pas et
      // ne se tait pas non plus.
      title={focus.on ? "Retirer d'aujourd'hui" : (focus.refusal ?? 'Faire aujourd\u2019hui')}
      aria-label={
        focus.on
          ? `Retirer « ${task.title} » d'aujourd'hui`
          : focus.refusal ?? `Faire « ${task.title} » aujourd'hui`
      }
      disabled={!focus.on && !!focus.refusal}
      onClick={() => {
        focus.toggle();
        onSwipe?.(false);
      }}
    >
      <IconFlag size={tailleIcone} filled={focus.on} />
    </button>
  );

  const btnEcheance = telephone && deadline && (
    <button
      key="echeance"
      className={classeCommande}
      tabIndex={horsTab}
      aria-label={
        task.due_at
          ? `Modifier l\u2019échéance de « ${task.title} »`
          : `Fixer une échéance à « ${task.title} »`
      }
      onClick={() => {
        deadline.onStartEdit();
        onSwipe?.(false);
      }}
    >
      <IconAlarmClock size={tailleIcone} />
    </button>
  );

  const cls = [
    'task',
    // Une tâche du jour se voit SANS survol et sans lire son fanion : c'est un
    // engagement pris, il doit se repérer d'un balayage de l'écran.
    focus?.on ? 'task--today' : '',
    drag?.dragging ? 'task--dragging' : '',
    splitActive ? 'task--split' : '',
    task.done ? 'task--done' : '',
    flash ? 'task--flash' : '',
    statut ? `task--${statut}` : '',
    /* `cursor: grab` ne doit s'afficher que là où la carte se déplace VRAIMENT
       (#92). C'est la même expression que `draggable` ci-dessous, et elle vit ici
       parce que c'est ici qu'on la connaît — une règle CSS ne pourrait que la
       deviner. « Aujourd'hui » et « Revue » ne passent pas `drag` du tout. */
    !!drag && !task.done && !renaming && !telephone ? 'task--saisissable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * `Alt`+↑/↓ — capté sur le CONTENEUR, pas sur la carte.
   *
   * L'événement remonte du contrôle qui a réellement le focus (la case à cocher
   * ou le `⋯`), ce qui donne le raccourci **sans ajouter d'arrêt de tabulation**.
   * Une case compte déjà un arrêt par contrôle de chaque tâche ; en ajouter un par
   * carte doublerait le parcours clavier.
   */
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // Pas de raccourci pendant une saisie, ni là où la fonction n'existe pas.
    if (!reorder || !e.altKey || renaming) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    // `Alt`+flèche navigue dans l'historique sur certains navigateurs : le geste
    // nous étant destiné, on le consomme — y compris en bout de liste, où il n'a
    // rien à faire mais ne doit surtout pas quitter la page.
    e.preventDefault();
    e.stopPropagation();
    (e.key === 'ArrowUp' ? reorder.up : reorder.down)?.();
  }

  return (
    <div className="card-wrap" data-task={task.id} ref={wrapRef} onKeyDown={onKeyDown}>
      <div className="task-anchor">
      {/* ⚠️ `.task-swipe` s'insère DANS `.task-anchor` et au-dessus de la seule
          `.task` : le menu `⋯` reste son frère, donc hors du `overflow: hidden`
          — dedans, il serait rogné dès son ouverture. Et l'ancrage du menu, qui
          dépend de `.task-anchor` (voir styles.css), ne bouge pas. */}
      <div
        ref={swipeRef}
        className={`task-swipe${balayage.suit ? ' task-swipe--suit' : ''}`}
        {...(bandeau ? balayage.gestes : {})}
      >
        {bandeau && (
          /* `aria-hidden` fermé : un lecteur d'écran ne doit jamais rencontrer
             une commande invisible. Le menu `⋯` porte les mêmes actions, lui. */
          <div
            className="task-swipe__actions"
            style={{ width: largeurBandeau }}
            aria-hidden={!swipeOpen}
          >
            {btnEtape}
            {btnAujourdhui}
            {btnEcheance}
          </div>
        )}
      <div
        className={cls}
        style={
          {
            viewTransitionName: `vt-${task.id}`,
            ...(balayage.decalage ? { transform: `translateX(${balayage.decalage}px)` } : null),
          } as CSSProperties
        }
        // Pas de déplacement pendant une saisie : le glisser volerait le curseur.
        // Ni sous 720 px : le glisser HTML5 ne s'y déclenche pas au doigt, et
        // l'axe horizontal appartient au balayage.
        draggable={!!drag && !task.done && !renaming && !telephone}
        onDragStart={(e: DragEvent) => {
          if (!drag) return;
          e.dataTransfer.effectAllowed = 'move';
          window.setTimeout(() => {
            drag.start();
            onMenu(false);
          }, 0);
        }}
        onDragEnd={() => drag?.end()}
        onDragOver={(e: DragEvent) => {
          if (split?.ok) {
            e.preventDefault();
            e.stopPropagation();
            split.over();
          }
        }}
        onDrop={(e: DragEvent) => {
          if (split?.ok) {
            e.preventDefault();
            e.stopPropagation();
            split.drop();
          }
        }}
      >
        {/* La poignée est conditionnée à `drag`, comme le geste qu'elle annonce :
            absente, elle mènerait à rien. Masquée au lecteur d'écran — sans quoi
            il énonce les points braille de « ⠿ » sur chaque carte. */}
        {drag && !paired && (
          <span className="task__grip" aria-hidden="true">
            ⠿
          </span>
        )}
        <button
          className={`task__check${task.done ? ' task__check--done' : ''}`}
          onClick={onCheck}
          aria-label={task.done ? 'Rétablir' : 'Terminer'}
        />
        {renaming ? (
          <form
            className="task__rename"
            onSubmit={(e) => {
              e.preventDefault();
              rename.commit();
            }}
          >
            <input
              className="task__rename-input"
              value={rename.value ?? ''}
              autoFocus
              maxLength={500}
              onChange={(e) => rename.change(e.target.value)}
              // Échap annule. Pas de fermeture au blur : elle avalerait la
              // saisie dès qu'on clique ailleurs pour valider.
              onKeyDown={(e) => {
                if (e.key === 'Escape') rename.cancel();
              }}
            />
          </form>
        ) : (
          <span
            ref={titre.ref}
            className={[
              'task__title',
              task.done ? 'task__title--done' : '',
              titre.deplie ? 'task__title--deplie' : '',
              titre.tronque ? 'task__title--tronque' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            /* L'infobulle native ne sert QUE quand le titre est coupé : la
               poser sur tous les titres doublerait un texte déjà lisible, et le
               ferait énoncer deux fois par un lecteur d'écran. */
            title={titre.tronque && !titre.deplie ? task.title : undefined}
            // Double-clic pour renommer : le geste attendu sur un titre, et il
            // n'existait nulle part. Il PARTAGE son premier clic avec le
            // dépliage — c'est le hook qui désarme son minuteur, en écoutant le
            // `dblclick` sur la carte.
            onDoubleClick={() => rename.start()}
          >
            {task.title}
          </span>
        )}
        {/* Le badge porte SON TEXTE, pas seulement sa couleur : le rouge seul
            n'informerait pas un daltonien. `<time>` garde la date brute lisible
            par les technologies d'assistance derrière le libellé relatif. */}
        {statut && task.due_at && (
          <time className={`due due--${statut}`} dateTime={task.due_at}>
            ⏰ {formatDeadline(task.due_at, deadline?.now)}
          </time>
        )}
        {/* Même emplacement et même patron que l'échéance : ce qui QUALIFIE la
            tâche se lit d'un même coup d'œil que son titre (#23). */}
        <OriginBadge origin={task.origin} />
        {/* Les deux raccourcis, ici seulement AU-DESSUS de 720 px : en dessous
            ils vivent dans le bandeau, où ils ne mangent plus le titre.
            Ils ne s'affichent qu'au survol ou au focus clavier, pour qu'une
            grille de trente tâches reste une grille de trente titres — une
            pastille « ＋ étape » vivait auparavant SOUS la carte, invisible au
            repos mais occupant sa ligne. */}
        {!telephone && !paired && btnEtape}
        {!telephone && !paired && btnAujourdhui}
        {/* Le glyphe seul nommait ce bouton « ⋯ » dans l'arbre d'accessibilité :
            autant de boutons identiques et anonymes qu'il y a de tâches. */}
        <button
          className="task__more"
          aria-label={`Actions pour « ${task.title} »`}
          aria-expanded={menuOpen}
          onClick={() => onMenu(!menuOpen)}
        >
          ⋯
        </button>
      </div>
      </div>
      {menuOpen && (
        <div className="task-menu">
          {/* L'ORDRE DU MENU SUIT CE QU'ON Y FAIT LE PLUS.
              Classer d'abord — c'est le geste de la matrice, celui pour lequel
              on ouvre ce menu. Puis déplacer, puis enrichir. Les gestes rares
              (renommer, supprimer) finissent en bas, où l'on ne clique pas par
              accident. */}
          <div className="task-menu__label">Affecter à</div>
          <div className="task-menu__grid">
            {QUADS.map((b) => (
              <button
                key={b.key}
                className="move-btn"
                style={{ background: b.bg, color: b.dark }}
                disabled={b.key === quad.key}
                onClick={() => onMoveQuad(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          {/* Les matrices sont RANGÉES PAR UNIVERS, dans l'ordre de l'accueil.
              La liste plate d'avant tenait tant qu'on avait trois matrices ;
              passé quelques univers elle n'avait plus ni ordre ni repère, alors
              que l'accueil les range depuis #62. Même principe que #96 côté
              menu contextuel de l'extension.
              Sans aucun univers, on retombe EXACTEMENT sur la liste d'avant :
              c'est l'état de tout compte qui n'a rien rangé. */}
          {otherBoards.length > 0 && (
            <>
              <div className="task-menu__sep" role="separator" />
              <div className="task-menu__label">Déplacer vers</div>
              {groupes.length <= 1 ? (
                <div className="task-menu__boards">
                  {otherBoards.map((b) => (
                    <button key={b.id} className="board-btn" onClick={() => onMoveBoard(b)}>
                      {b.name}
                    </button>
                  ))}
                </div>
              ) : (
                groupes.map((g) => {
                  const cle = g.universe?.id ?? 'sans-univers';
                  const ouvert = openUni === cle;
                  return (
                    <div
                      className={`task-menu__uni${ouvert ? ' task-menu__uni--open' : ''}`}
                      key={cle}
                      // Le survol ouvre sur pointeur fin, et LÀ SEULEMENT : au
                      // doigt le clic ci-dessous est le chemin unique (#90).
                      {...(pointeurFin
                        ? {
                            onMouseEnter: () => setOpenUni(cle),
                            onMouseLeave: () => setOpenUni((c) => (c === cle ? null : c)),
                          }
                        : {})}
                    >
                      <button
                        className="task-menu__action task-menu__uni-head"
                        aria-expanded={ouvert}
                        onClick={() => setOpenUni(ouvert ? null : cle)}
                      >
                        {/* « Sans univers » plutôt que « Autre » : c'est le mot
                            que l'accueil emploie déjà pour ce même groupe. */}
                        {g.universe?.name ?? 'Sans univers'}
                        <span className="task-menu__caret" aria-hidden="true">
                          ›
                        </span>
                      </button>
                      {ouvert && (
                        <div className="task-menu__flyout">
                          {g.boards.map((b) => (
                            <button key={b.id} className="board-btn" onClick={() => onMoveBoard(b)}>
                              {b.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
          <div className="task-menu__sep" role="separator" />
          {/* ⚠️ « Ajouter une étape » n'existait QUE sur la carte, révélée au
              survol — donc nulle part au doigt, et nulle part au clavier sur une
              tablette. C'est la condition qui manquait pour pouvoir retirer les
              raccourcis de la carte sous 720 px : un geste directionnel ne doit
              jamais être le seul accès à une action (WCAG 2.5.1). */}
          {subtasks && (
            <button
              className="task-menu__action"
              onClick={() => {
                if (!subtasks.open) subtasks.onToggleOpen();
                setAskAdd((n) => n + 1);
                onMenu(false);
              }}
            >
              <IconLayersPlus size={13} />
              Ajouter une étape
            </button>
          )}
          {/* L'ajout d'un lien vit ICI et pas sur la carte : une tâche sans
              lien ne doit rien afficher de plus qu'aujourd'hui. */}
          {attachments && (
            <button
              className="task-menu__action"
              onClick={() => {
                attachments.onStartAdd();
                onMenu(false);
              }}
            >
              <IconPaperclip size={13} />
              Attacher un lien
            </button>
          )}
          {/* Avec les liens, dans le groupe des gestes qui ENRICHISSENT la
              tâche. */}
          {deadline && (
            <button
              className="task-menu__action"
              onClick={() => {
                deadline.onStartEdit();
                onMenu(false);
              }}
            >
              <IconAlarmClock size={13} />
              {task.due_at ? 'Modifier l’échéance' : 'Fixer une échéance'}
            </button>
          )}
          {focus &&
            (focus.on || !focus.refusal ? (
              <button className="task-menu__action task-menu__action--focus" onClick={focus.toggle}>
                <IconFlag size={13} filled={focus.on} />
                {focus.on ? "Retirer d'aujourd'hui" : "Faire aujourd'hui"}
              </button>
            ) : (
              // Désactivée avec son motif, et non masquée : c'est la limite qui
              // fait la valeur du mode, elle doit se voir (#49).
              <span
                className="task-menu__action task-menu__action--off"
                role="button"
                aria-disabled="true"
              >
                <IconFlag size={13} />
                Faire aujourd'hui
                <span className="task-menu__why">{focus.refusal}</span>
              </span>
            ))}
          <div className="task-menu__sep" role="separator" />
          {/* Les deux entrées restent VISIBLES et grisées : un menu dont les
              lignes apparaissent et disparaissent selon la position se relit à
              chaque ouverture.
              Elles portent leur raccourci en clair — c'est ainsi qu'on apprend
              `Alt`+↑ : en lisant le menu. Un raccourci que rien n'annonce
              n'existe pas. */}
          {reorder && (
            <>
              <button
                className="task-menu__action task-menu__action--move"
                disabled={!reorder.up}
                onClick={() => reorder.up?.()}
              >
                ↑ Monter <kbd className="task-menu__key">Alt+↑</kbd>
              </button>
              <button
                className="task-menu__action task-menu__action--move"
                disabled={!reorder.down}
                onClick={() => reorder.down?.()}
              >
                ↓ Descendre <kbd className="task-menu__key">Alt+↓</kbd>
              </button>
            </>
          )}
          <div className="task-menu__sep" role="separator" />
          {/* Seule sortie volontaire du lien : sans elle, il ne se déferait
              plus que par suppression ou complétion — soit par accident. */}
          {task.pair_id && partnerOf(tasks, task) && (
            <button className="task-menu__action" onClick={onUnpair}>
              Dissocier
            </button>
          )}
          <button
            className="task-menu__action"
            onClick={() => {
              rename.start();
              onMenu(false);
            }}
          >
            <IconPenLine size={13} />
            Renommer
          </button>
          <button className="task-menu__action task-menu__action--del" onClick={onDelete}>
            <IconTrash size={13} />
            Supprimer
          </button>
        </div>
      )}
      </div>
      {/* Les liens d'abord, les étapes ensuite : le lien qualifie la tâche
          elle-même, l'étape la décompose. */}
      {attachments && !renaming && (
        <Attachments
          task={task}
          attachments={attachments.all}
          adding={attachments.adding}
          onCancelAdd={attachments.onCancelAdd}
          onAdd={attachments.onAdd}
          onRemove={attachments.onRemove}
        />
      )}
      {deadline && !renaming && (
        <Deadline
          task={task}
          editing={deadline.editing}
          onCancel={deadline.onCancelEdit}
          onSet={deadline.onSet}
          onClear={deadline.onClear}
        />
      )}
      {/* Sous la carte, jamais dedans : une étape n'est pas une demi-tâche, elle
          appartient à un autre niveau de lecture. */}
      {subtasks && !renaming && (
        <Subtasks
          parent={task}
          tasks={tasks}
          open={subtasks.open}
          onToggleOpen={subtasks.onToggleOpen}
          onAdd={subtasks.onAdd}
          onCheck={subtasks.onCheck}
          onDelete={subtasks.onDelete}
          askAdd={askAdd}
        />
      )}
    </div>
  );
}
