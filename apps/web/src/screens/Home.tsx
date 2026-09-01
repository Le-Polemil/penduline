import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ageInDays,
  countOpen,
  isOpenRow,
  groupByUniverse,
  planBoardReorder,
  QUADS,
  summarizeUniverse,
  type Universe,
  type UniverseSummary,
} from '@penduline/shared';
import type { Store } from '../data/store';
import { readLastReview } from '../data/reviewPrefs';
import { Confirm } from '../components/Confirm';
import { dropTarget, gapIndexAt } from '../dnd/gap';
import { ordinal, useAnnounce } from '../a11y/announce';
import type { Scope } from './Global';

/** Durée d'un appui long, alignée sur la convention des OS mobiles. */
const LONG_PRESS_MS = 500;

/**
 * Survol nécessaire pour qu'un univers replié se déplie pendant un glisser.
 *
 * Plus long que l'appui long : on traverse un en-tête replié pour atteindre le
 * groupe suivant, et un dépliage à chaque passage ferait sauter la page sous le
 * curseur. C'est l'ordre de grandeur des dossiers à ressort des explorateurs de
 * fichiers, d'où le motif vient.
 */
const SPRING_MS = 700;

/** Interstice survolé : à quel groupe il appartient, et à quelle place. */
type Gap = { universeId: string | null; index: number };

/**
 * Ce qu'on déplace — et l'accueil en déplace deux sortes.
 *
 * Les matrices se glissent entre elles, les univers entre eux, sur le même écran
 * et par des interstices qui se ressemblent. Sans discriminant, déposer un
 * univers dans un interstice de matrices deviendrait possible et silencieusement
 * faux.
 *
 * Le discriminant vit dans l'état React plutôt que dans un type MIME du
 * `dataTransfer` : les deux glissers naissent dans ce composant, l'information
 * n'a donc pas à traverser le DOM — et une zone de dépôt qui oublie sa garde se
 * fait signaler à la compilation, ce qu'une chaîne MIME mal lue ne fait jamais.
 */
type Drag = { kind: 'board' | 'universe'; id: string };

/**
 * Ce sur quoi la feuille d'actions porte.
 *
 * Même forme que `Drag`, et pour la même raison : l'accueil manipule deux sortes
 * de choses, et la feuille doit savoir laquelle elle décrit. Un simple
 * identifiant se serait cherché dans les deux listes, avec la certitude qu'un
 * jour l'une répondrait pour l'autre.
 */
type SheetTarget = { kind: 'board' | 'universe'; id: string };

/**
 * Clé de repli du groupe « Sans univers ».
 *
 * Ce groupe n'existe pas en base et n'a donc pas d'identifiant — or c'est celui
 * qui accumule les matrices non rangées, donc celui qu'on a le plus besoin de
 * replier. Un identifiant d'univers étant un UUID, la collision est impossible.
 */
const LOOSE = 'none';

const COLLAPSED_KEY = 'penduline:universes-collapsed';

/**
 * Relit les univers repliés.
 *
 * `localStorage` et non la base : un repli est un état de **lecture**, pas une
 * donnée (#72). Il ne décrit pas ce que contient le compte, seulement comment
 * cet appareil-ci le regarde — et le téléphone a le droit d'en avoir un autre
 * que le poste.
 *
 * Pure, comme `readView` : elle sert d'initialiseur à `useState`, et tout ce qui
 * ne se relit pas retombe sur « rien de replié ». Un accueil entièrement déplié
 * est toujours lisible ; un accueil replié à tort cache des matrices.
 */
function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((id): id is string => typeof id === 'string'));
  } catch {
    // `localStorage` peut lever (navigation privée verrouillée) et le JSON peut
    // être corrompu. Ni l'un ni l'autre n'empêche d'afficher l'accueil.
    return new Set();
  }
}

export function Home({
  store,
  onOpen,
  onGlobal,
  onReview,
  onStats,
}: {
  store: Store;
  onOpen: (boardId: string) => void;
  onGlobal: (scope: Scope) => void;
  onReview: () => void;
  onStats: () => void;
}) {
  // `null` = bouton au repos ; une chaîne (même vide) = champ de saisie ouvert.
  const [draft, setDraft] = useState<string | null>(null);
  const [uniDraft, setUniDraft] = useState<string | null>(null);
  // Dernière matrice créée : porte l'animation d'apparition, le temps de celle-ci.
  const [fresh, setFresh] = useState<string | null>(null);
  // Renommage en place. Matrices et univers sont distincts : deux listes
  // différentes peuvent porter le même identifiant de saisie sinon.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editingUni, setEditingUni] = useState<{ id: string; name: string } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [uniToDelete, setUniToDelete] = useState<string | null>(null);
  // Menu d'actions ouvert à l'appui long (tactile) : les actions au survol sont
  // inatteignables au doigt.
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  /** Ce qui a ouvert la feuille — pour lui rendre le focus à la fermeture. */
  const sheetOrigin = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hoverGap, setHoverGap] = useState<Gap | null>(null);
  /** Interstice d'univers survolé — une seule liste, donc un simple indice. */
  const [hoverUniGap, setHoverUniGap] = useState<number | null>(null);
  /** Univers repliés, par identifiant — ou `LOOSE` pour « Sans univers ». */
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const pressTimer = useRef<number>();
  /** Un appui long déclenche aussi un `click` : on le neutralise. */
  const swallowClick = useRef(false);
  /** Dossier à ressort : le minuteur, et le groupe pour lequel il est armé. */
  const springTimer = useRef<number>();
  const springFor = useRef<string | null>(null);

  const announce = useAnnounce();

  // Un dialogue qui s'ouvre sans donner le focus laisse le clavier derrière lui :
  // la feuille resterait invisible à qui ne la voit pas apparaître.
  useEffect(() => {
    if (sheet) sheetRef.current?.focus();
  }, [sheet]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Perdre la mémoire d'un repli est un désagrément, pas une panne.
    }
  }, [collapsed]);

  const groups = groupByUniverse(store.universes, store.boards);
  /**
   * Sans aucun univers, on n'affiche pas d'en-tête : l'accueil se lit alors
   * exactement comme avant cette fonctionnalité. C'est l'état de tous les
   * comptes au lendemain de la migration — il doit rester impeccable.
   */
  const grouped = store.universes.length > 0;
  /**
   * Le repère « dernière revue ». Calculé au rendu et non mémorisé : il change
   * de jour en jour, et l'accueil se re-rend bien plus souvent que ça.
   *
   * Arrondi au jour plein, et « aujourd'hui » plutôt que « il y a 0 jour ».
   */
  const reviewHint = (() => {
    const last = readLastReview();
    if (!last) return 'ce qui stagne, ce qui n’a jamais bougé';
    const days = ageInDays(last, Date.now());
    if (days === null) return 'ce qui stagne, ce qui n’a jamais bougé';
    const d = Math.floor(days);
    if (d <= 0) return 'consultée aujourd’hui';
    return `dernière consultation il y a ${d} jour${d > 1 ? 's' : ''}`;
  })();
  /**
   * Les univers dans l'ordre affiché — la liste que le glisser réordonne.
   *
   * Tirée de `groups` et non de `store.universes` : le tri par position est déjà
   * fait là, et les deux listes ne peuvent pas diverger dès lors qu'elles ont la
   * même source.
   */
  const uniOrder: Universe[] = groups
    .map((g) => g.universe)
    .filter((u): u is Universe => u !== null);
  /**
   * Le groupe « Sans univers » est-il masqué ?
   *
   * Il porte normalement l'interstice de FIN de la liste d'univers, puisqu'il la
   * ferme. Masqué — vide et aucune matrice en cours de déplacement — cet
   * interstice doit se rendre ailleurs, sinon déposer un univers en dernier
   * n'aurait aucun repère visuel.
   */
  const looseHidden = (() => {
    const loose = groups[groups.length - 1];
    return grouped && !loose.universe && loose.boards.length === 0 && drag?.kind !== 'board';
  })();

  function boardsOf(universeId: string | null) {
    return store.boards.filter((b) => b.universe_id === universeId).sort((a, b) => a.position - b.position);
  }

  /** Déposer dans un interstice range la matrice DANS ce groupe et l'y place. */
  function dropAt(universeId: string | null, beforeId: string | null) {
    if (drag?.kind !== 'board') return;
    void store.moveBoard(drag.id, universeId, beforeId);
    setDrag(null);
    setHoverGap(null);
    disarmSpring();
  }

  /**
   * L'interstice d'univers désigné par un survol d'en-tête.
   *
   * Un indice négatif désigne l'en-tête « Sans univers » : ce groupe ferme
   * toujours la liste (`groupByUniverse`), il n'y a pas d'après lui. Le déposer
   * dessus veut donc dire « à la fin », sans qu'une moitié d'en-tête ait à en
   * décider.
   */
  function uniGapAt(clientY: number, rect: DOMRect, index: number): number {
    return index < 0 ? uniOrder.length : gapIndexAt(clientY, rect, index);
  }

  function dropUniverse(at: number) {
    if (drag?.kind !== 'universe') return;
    const target = dropTarget(uniOrder, drag.id, at);
    const id = drag.id;
    setDrag(null);
    setHoverUniGap(null);
    // `false` = les deux interstices qui bordent l'univers, donc sa place
    // actuelle. À distinguer de `null`, qui veut dire « à la fin ».
    if (target === false) return;
    void store.reorderUniverse(id, target);
  }

  /**
   * Monter / descendre une matrice dans son groupe.
   *
   * La règle vit désormais dans `packages/shared` : le tactile (feuille d'appui
   * long) et le clavier (boutons ↑ ↓) s'en servent tous les deux, et ses bornes
   * y sont enfin testées.
   */
  function move(id: string, dir: -1 | 1) {
    const board = store.boards.find((b) => b.id === id);
    if (!board) return;
    const plan = planBoardReorder(store.boards, board, dir);
    if (!plan) return;
    void store.moveBoard(id, board.universe_id, plan.beforeId);
    announce(`« ${board.name} » déplacée en ${ordinal(plan.index)} position sur ${plan.total}.`);
  }

  /**
   * Arme le dépliage automatique d'un groupe replié survolé pendant un glisser.
   *
   * `dragover` se répète tant que le curseur reste là : sans le test sur
   * `springFor`, chaque répétition relancerait le minuteur, qui n'arriverait
   * jamais à échéance. Il retient donc POUR QUEL groupe on attend — passer sur
   * un autre en-tête désarme et réarme.
   */
  function armSpring(key: string) {
    if (springFor.current === key) return;
    disarmSpring();
    springFor.current = key;
    springTimer.current = window.setTimeout(() => {
      springFor.current = null;
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, SPRING_MS);
  }

  function disarmSpring() {
    window.clearTimeout(springTimer.current);
    springFor.current = null;
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      // `delete` rend `false` quand la clé était absente : un seul test suffit.
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** Ouvre la feuille en retenant d'où l'on vient (clavier), ou de rien (doigt). */
  function openSheet(target: SheetTarget, trigger: HTMLElement | null) {
    sheetOrigin.current = trigger;
    setSheet(target);
  }

  function closeSheet() {
    setSheet(null);
    // Fermer un dialogue sans rendre le focus laisse le clavier au début du
    // document : on repart de la ligne qu'on venait de manipuler.
    sheetOrigin.current?.focus();
    sheetOrigin.current = null;
  }

  function pressStart(e: ReactPointerEvent, target: SheetTarget) {
    if (e.pointerType !== 'touch') return;
    swallowClick.current = false;
    pressTimer.current = window.setTimeout(() => {
      swallowClick.current = true;
      openSheet(target, null);
    }, LONG_PRESS_MS);
  }
  function pressEnd() {
    window.clearTimeout(pressTimer.current);
  }

  async function create() {
    const name = (draft ?? '').trim();
    if (!name) return;
    // La nouvelle matrice arrive SANS univers, comme une tâche capturée arrive
    // dans « À trier » : créer et classer sont deux gestes distincts.
    const id = await store.addBoard(name);
    setDraft(null);
    if (id) {
      setFresh(id);
      window.setTimeout(() => setFresh((f) => (f === id ? null : f)), 700);
    }
  }

  async function createUniverse() {
    const name = (uniDraft ?? '').trim();
    if (!name) return;
    await store.addUniverse(name);
    setUniDraft(null);
  }

  function commitRename() {
    if (!editing) return;
    const name = editing.name.trim();
    const before = store.boards.find((b) => b.id === editing.id)?.name;
    if (name && name !== before) void store.renameBoard(editing.id, name);
    setEditing(null);
  }

  function commitUniRename() {
    if (!editingUni) return;
    const name = editingUni.name.trim();
    const before = store.universes.find((u) => u.id === editingUni.id)?.name;
    if (name && name !== before) void store.renameUniverse(editingUni.id, name);
    setEditingUni(null);
  }

  /** Monter / descendre un univers : même « avant le suivant » que les matrices. */
  function moveUniverse(id: string, dir: -1 | 1) {
    const list = store.universes;
    const i = list.findIndex((u) => u.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    void store.reorderUniverse(id, dir === -1 ? list[j].id : (list[j + 1]?.id ?? null));
    announce(`Univers « ${list[i].name} » déplacé en ${ordinal(j + 1)} position sur ${list.length}.`);
  }

  const doomed = store.boards.find((b) => b.id === toDelete) ?? null;
  const doomedCount = doomed ? store.tasks.filter((t) => t.board_id === doomed.id).length : 0;
  const doomedUni = store.universes.find((u) => u.id === uniToDelete) ?? null;
  const doomedUniCount = doomedUni ? boardsOf(doomedUni.id).length : 0;

  return (
    <div className="home">
      <h1 className="home-title">Penduline</h1>
      <p className="home-sub">
        Urgent n'est pas important. En croisant ces deux axes, on voit d'un coup d'œil
        quoi faire tout de suite, quoi planifier, quoi déléguer — et quoi laisser tomber.
      </p>

      {/* Au-dessus de la liste, parce que c'est une façon de la lire — pas une
          matrice de plus. Masquée tant qu'aucune matrice n'existe : il n'y
          aurait rien à voir d'ensemble. */}
      {store.boards.length > 0 && (
        <div className="home-lenses">
          <button className="home-global" onClick={() => onGlobal({ kind: 'all' })}>
            Vue globale
            <span className="home-global__hint">toutes vos tâches dans une seule grille</span>
          </button>
          {/* Le seul rappel du produit, et il est passif : un repère, pas une
              relance. Un outil qui harcèle finit désinstallé (#47). */}
          <button className="home-global home-global--review" onClick={onReview}>
            Revue
            <span className="home-global__hint">{reviewHint}</span>
          </button>
          {/* Troisième lentille, et la seule tournée vers le passé : la revue
              dit ce qui stagne, la rétrospective où le temps est passé (#48). */}
          <button className="home-global home-global--stats" onClick={onStats}>
            Rétrospective
            <span className="home-global__hint">dans quelle case passe votre temps</span>
          </button>
        </div>
      )}

      {store.boards.length === 0 && !grouped ? (
        <p className="home-empty">
          Aucune matrice pour l'instant. Créez la première : une pièce, une journée,
          un projet… le découpage vous appartient.
        </p>
      ) : (
        <div
          className={`board-list${drag?.kind === 'board' ? ' board-list--dragging' : ''}`}
          // Quitter la liste sans déposer doit effacer l'indicateur : sinon le
          // trait continue de désigner une destination qu'on a quittée. Le test
          // sur `relatedTarget` écarte les passages d'un enfant à l'autre, qui
          // déclenchent eux aussi `dragleave`.
          onDragLeave={(e: DragEvent) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setHoverGap(null);
            setHoverUniGap(null);
            disarmSpring();
          }}
        >
          {groups.map((group) => {
            const universeId = group.universe?.id ?? null;
            // Le groupe sans univers reste un point de dépôt même vide — c'est
            // par lui qu'on SORT une matrice d'un univers. Mais on ne l'affiche
            // pas s'il est vide et qu'aucun déplacement n'est en cours : ce
            // serait un titre sans contenu.
            if (grouped && !group.universe && group.boards.length === 0 && drag?.kind !== 'board')
              return null;
            const uniEditing = editingUni?.id === universeId;
            const foldKey = universeId ?? LOOSE;
            // Sans en-tête (aucun univers), il n'y a pas de chevron pour
            // déplier : un repli hérité d'un état antérieur enfermerait les
            // matrices sans issue.
            const folded = grouped && collapsed.has(foldKey);
            // -1 pour « Sans univers » : il n'est pas réordonnable, mais son
            // en-tête reste la cible qui veut dire « à la fin ».
            const uniIndex = group.universe ? uniOrder.findIndex((u) => u.id === universeId) : -1;

            return (
              <section
                className={`uni${
                  drag?.kind === 'universe' && drag.id === universeId ? ' uni--dragging' : ''
                }`}
                key={universeId ?? 'sans-univers'}
                // Repli du groupe : tout ce qui n'est pas une ligne — l'en-tête,
                // l'interstice de fin, un univers vide — range en fin de groupe.
                // Sans lui, un univers fraîchement créé serait inatteignable.
                onDragOver={(e: DragEvent) => {
                  if (drag?.kind !== 'board') return;
                  e.preventDefault();
                  setHoverGap({ universeId, index: group.boards.length });
                  // Replié, la section n'est que son en-tête : survoler l'un
                  // revient à survoler l'autre. Un seul point d'armement suffit.
                  if (folded) armSpring(foldKey);
                }}
                onDragLeave={(e: DragEvent) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  disarmSpring();
                }}
                onDrop={(e: DragEvent) => {
                  if (drag?.kind !== 'board') return;
                  e.preventDefault();
                  dropAt(universeId, null);
                }}
              >
                {/* Interstice d'univers : celui qui PRÉCÈDE ce groupe. Le
                    groupe « Sans univers » fermant la liste, le sien vaut la
                    fin. Un repère, pas une cible — c'est l'en-tête qui capte. */}
                {grouped && <UniGap active={hoverUniGap === (group.universe ? uniIndex : uniOrder.length)} />}

                {grouped && (
                  <div
                    className="uni-head"
                    // Le dépôt d'un univers se joue sur l'en-tête, comme celui
                    // d'une matrice se joue sur sa ligne depuis #74 : on vise
                    // une ligne entière, jamais un ruban entre deux.
                    // `stopPropagation` empêche la section d'y voir un dépôt de
                    // matrice — les deux couches ne doivent jamais se croiser.
                    onDragOver={(e: DragEvent) => {
                      if (drag?.kind !== 'universe') return;
                      e.preventDefault();
                      e.stopPropagation();
                      setHoverUniGap(uniGapAt(e.clientY, e.currentTarget.getBoundingClientRect(), uniIndex));
                    }}
                    onDrop={(e: DragEvent) => {
                      if (drag?.kind !== 'universe') return;
                      e.preventDefault();
                      e.stopPropagation();
                      dropUniverse(uniGapAt(e.clientY, e.currentTarget.getBoundingClientRect(), uniIndex));
                    }}
                  >
                    {uniEditing && editingUni ? (
                      <form
                        className="uni-head__rename"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitUniRename();
                        }}
                      >
                        <input
                          className="uni-head__input"
                          value={editingUni.name}
                          autoFocus
                          maxLength={120}
                          onChange={(e) => setEditingUni({ id: editingUni.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingUni(null);
                          }}
                        />
                        <button className="board-act board-act--ok" type="submit" disabled={!editingUni.name.trim()}>
                          OK
                        </button>
                        <button className="board-act" type="button" onClick={() => setEditingUni(null)}>
                          Annuler
                        </button>
                      </form>
                    ) : (
                      <>
                        {/* La poignée ouvre l'en-tête, avant le chevron : c'est
                            la seule zone `draggable`, et la mettre en tête la
                            sort du chemin du nom. `aria-hidden` et non focusable
                            — le clavier a les flèches ↑ ↓, une poignée dans
                            l'ordre de tabulation ne lui offrirait rien.
                            Elle vit en marge négative, hors de l'alignement :
                            l'ancre de l'en-tête est le chevron. « Sans univers »
                            n'en a donc pas besoin pour s'aligner. */}
                        {group.universe && (
                          <span
                            className="uni-head__grip"
                            aria-hidden="true"
                            draggable
                            onDragStart={(e: DragEvent) => {
                              e.dataTransfer.effectAllowed = 'move';
                              // Différé d'un tick, comme pour les matrices :
                              // repeindre la source dans le même tour de boucle
                              // annule l'image de glisser du navigateur.
                              window.setTimeout(() => setDrag({ kind: 'universe', id: group.universe!.id }), 0);
                            }}
                            onDragEnd={() => {
                              setDrag(null);
                              setHoverUniGap(null);
                            }}
                          >
                            ⠿
                          </span>
                        )}
                        {/* Le chevron vit HORS de `.uni-head__actions` : ce
                            groupe est masqué au repos, or le repli est un état
                            de lecture — il ne doit jamais se chercher, et doit
                            exister au doigt.
                            Un SVG qui pivote, et non deux glyphes : « ⌄ » et
                            « › » n'ont pas les mêmes métriques, et l'en-tête
                            se décalait verticalement selon l'état. */}
                        <button
                          className="uni-head__fold"
                          aria-expanded={!folded}
                          aria-label={`${folded ? 'Déplier' : 'Replier'} « ${
                            group.universe?.name ?? 'Sans univers'
                          } »`}
                          onClick={() => toggleCollapse(foldKey)}
                        >
                          <svg
                            className="uni-head__chev"
                            viewBox="0 0 10 10"
                            width="10"
                            height="10"
                            aria-hidden="true"
                          >
                            <path
                              d="M2 3.75 L5 6.75 L8 3.75"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        {/* Le nom EST le geste « entrer dedans », comme le nom
                            d'une matrice l'ouvre. Le groupe sans univers reste
                            un libellé : `Scope` ne sait pas le représenter, il
                            n'y a rien à ouvrir. */}
                        {group.universe ? (
                          <button
                            className="uni-head__name"
                            // Le nom seul ne dit pas ce que le clic fait.
                            aria-label={`Voir toutes les tâches de « ${group.universe.name} »`}
                            onClick={() => {
                              // L'appui long a déjà ouvert la feuille : sans ça,
                              // le relâchement ouvrirait AUSSI la vue globale.
                              if (swallowClick.current) {
                                swallowClick.current = false;
                                return;
                              }
                              onGlobal({ kind: 'universe', id: group.universe!.id });
                            }}
                            // L'appui long vit sur le nom, pas sur l'en-tête
                            // entier : posé plus haut, il partirait aussi sur le
                            // chevron et sur les actions, qui ont leur propre
                            // geste. C'est le motif exact de `.board-card`.
                            onPointerDown={(e) =>
                              pressStart(e, { kind: 'universe', id: group.universe!.id })
                            }
                            onPointerUp={pressEnd}
                            onPointerCancel={pressEnd}
                            onPointerLeave={pressEnd}
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            {group.universe.name}
                          </button>
                        ) : (
                          <span className="uni-head__name">Sans univers</span>
                        )}
                        {/* Replié, l'en-tête doit dire ce qu'il cache : sinon le
                            repli n'est plus un rangement, c'est un trou. */}
                        {folded && (
                          <span className="uni-head__summary">
                            {foldLabel(summarizeUniverse(group.boards, store.tasks))}
                          </span>
                        )}
                        {/* Le groupe sans univers n'est pas une ligne en base :
                            il n'a ni nom à changer ni existence à supprimer. */}
                        {group.universe && (
                          <span className="uni-head__actions">
                            <button
                              className="board-act"
                              aria-label={`Monter « ${group.universe.name} »`}
                              disabled={store.universes[0]?.id === universeId}
                              onClick={() => moveUniverse(group.universe!.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              className="board-act"
                              aria-label={`Descendre « ${group.universe.name} »`}
                              disabled={store.universes[store.universes.length - 1]?.id === universeId}
                              onClick={() => moveUniverse(group.universe!.id, 1)}
                            >
                              ↓
                            </button>
                            <button
                              className="board-act"
                              onClick={() => setEditingUni({ id: group.universe!.id, name: group.universe!.name })}
                            >
                              Renommer
                            </button>
                            <button
                              className="board-act board-act--danger"
                              onClick={() => setUniToDelete(group.universe!.id)}
                            >
                              Supprimer
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Replié, le groupe ne rend ni ses lignes ni son interstice de
                    fin — mais il reste une cible de dépôt : c'est le `onDrop` de
                    la section qui la porte, pas les lignes. */}
                {!folded && group.boards.map((board, index) => {
                  const pills = QUADS.map((q) => ({
                    ink: q.ink,
                    n: countOpen(store.tasks, board.id, q.key),
                  })).filter((p) => p.n > 0);
                  const total = store.tasks.filter(
                    (t) => t.board_id === board.id && isOpenRow(t),
                  ).length;
                  const meta = total ? `${total} ${total > 1 ? 'tâches' : 'tâche'}` : 'Rien à faire';
                  const isEditing = editing?.id === board.id;

                  return (
                    <div
                      key={board.id}
                      // La ligne entière est la cible, et la moitié survolée
                      // désigne l'interstice. Viser un ruban de 10 px demandait
                      // une précision que personne n'a — et le manquer annulait
                      // le déplacement au lieu de le ranger.
                      onDragOver={(e: DragEvent) => {
                        if (drag?.kind !== 'board') return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoverGap({ universeId, index: gapIndexAt(e.clientY, rect, index) });
                      }}
                      onDrop={(e: DragEvent) => {
                        if (drag?.kind !== 'board') return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const at = gapIndexAt(e.clientY, rect, index);
                        dropAt(universeId, group.boards[at]?.id ?? null);
                      }}
                    >
                      <BoardGap active={hoverGap?.universeId === universeId && hoverGap.index === index} />
                      <div
                        className={[
                          'board-row',
                          board.id === fresh ? 'board-row--fresh' : '',
                          drag?.kind === 'board' && drag.id === board.id ? 'board-row--dragging' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        // `draggable` sur le conteneur, jamais sur `.board-card` : un
                        // <button> déplaçable se comporte mal, et le clic d'ouverture
                        // doit continuer de fonctionner.
                        draggable={!isEditing}
                        onDragStart={(e: DragEvent) => {
                          e.dataTransfer.effectAllowed = 'move';
                          window.setTimeout(() => setDrag({ kind: 'board', id: board.id }), 0);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setHoverGap(null);
                          disarmSpring();
                        }}
                      >
                        {isEditing && editing ? (
                          <form
                            className="board-row__rename"
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename();
                            }}
                          >
                            <input
                              className="board-row__input"
                              value={editing.name}
                              autoFocus
                              maxLength={120}
                              onChange={(e) => setEditing({ id: board.id, name: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditing(null);
                              }}
                            />
                            <button className="board-act board-act--ok" type="submit" disabled={!editing.name.trim()}>
                              OK
                            </button>
                            <button className="board-act" type="button" onClick={() => setEditing(null)}>
                              Annuler
                            </button>
                          </form>
                        ) : (
                          <>
                            <button
                              className="board-card"
                              onClick={() => {
                                if (swallowClick.current) {
                                  swallowClick.current = false;
                                  return;
                                }
                                onOpen(board.id);
                              }}
                              onPointerDown={(e) => pressStart(e, { kind: 'board', id: board.id })}
                              onPointerUp={pressEnd}
                              onPointerCancel={pressEnd}
                              onPointerLeave={pressEnd}
                              onContextMenu={(e) => e.preventDefault()}
                            >
                              <span className="board-card__name">{board.name}</span>
                              <span className="board-card__meta">{meta}</span>
                              <span className="board-card__pills">
                                {pills.map((p, i) => (
                                  <span key={i} className="pill" style={{ background: p.ink }}>
                                    {p.n}
                                  </span>
                                ))}
                              </span>
                            </button>
                            <span className="board-row__actions">
                              {/* Même motif que `.uni-head__actions`, qui avait
                                  déjà ses flèches : réordonner une MATRICE, lui,
                                  n'existait qu'au glisser et à l'appui long —
                                  donc pas au clavier. */}
                              <button
                                className="board-act"
                                aria-label={`Monter « ${board.name} »`}
                                disabled={!planBoardReorder(store.boards, board, -1)}
                                onClick={() => move(board.id, -1)}
                              >
                                ↑
                              </button>
                              <button
                                className="board-act"
                                aria-label={`Descendre « ${board.name} »`}
                                disabled={!planBoardReorder(store.boards, board, 1)}
                                onClick={() => move(board.id, 1)}
                              >
                                ↓
                              </button>
                              {/* La porte clavier d'un chemin déjà écrit : la
                                  feuille contient « Déplacer vers un univers »,
                                  et n'était atteignable qu'au doigt. */}
                              <button
                                className="board-act"
                                aria-label={`Autres actions pour « ${board.name} »`}
                                aria-haspopup="dialog"
                                onClick={(e) => openSheet({ kind: 'board', id: board.id }, e.currentTarget)}
                              >
                                ⋯
                              </button>
                              <button
                                className="board-act"
                                title="Renommer"
                                aria-label={`Renommer « ${board.name} »`}
                                onClick={() => setEditing({ id: board.id, name: board.name })}
                              >
                                Renommer
                              </button>
                              <button
                                className="board-act board-act--danger"
                                title="Supprimer"
                                aria-label={`Supprimer « ${board.name} »`}
                                onClick={() => setToDelete(board.id)}
                              >
                                Supprimer
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Interstice de fin — un repère, pas une cible : c'est le
                    groupe lui-même qui capte le dépôt de fin, y compris vide. */}
                {!folded && (
                  <BoardGap
                    active={hoverGap?.universeId === universeId && hoverGap.index === group.boards.length}
                  />
                )}
              </section>
            );
          })}

          {/* La fin de la liste d'univers quand « Sans univers » ne la porte
              pas : sans lui, déposer un univers en dernier serait aveugle. */}
          {looseHidden && <UniGap active={hoverUniGap === uniOrder.length} />}
        </div>
      )}

      <div className="home-actions">
        {draft === null ? (
          <button className="add-board" onClick={() => setDraft('')}>
            ＋ Nouvelle matrice
          </button>
        ) : (
          <form
            className="add-board-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input
              className="add-board-input"
              value={draft}
              autoFocus
              placeholder="Nom de la matrice"
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              // Échap annule. Volontairement pas de fermeture au blur : cliquer sur
              // « Créer » déclenche d'abord le blur, ce qui perdrait la saisie.
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDraft(null);
              }}
            />
            <button className="add-board-submit" type="submit" disabled={!draft.trim()}>
              Créer
            </button>
            <button className="add-board-cancel" type="button" onClick={() => setDraft(null)}>
              Annuler
            </button>
          </form>
        )}

        {uniDraft === null ? (
          <button className="add-board add-board--uni" onClick={() => setUniDraft('')}>
            ＋ Nouvel univers
          </button>
        ) : (
          <form
            className="add-board-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createUniverse();
            }}
          >
            <input
              className="add-board-input"
              value={uniDraft}
              autoFocus
              placeholder="Nom de l'univers"
              maxLength={120}
              onChange={(e) => setUniDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setUniDraft(null);
              }}
            />
            <button className="add-board-submit" type="submit" disabled={!uniDraft.trim()}>
              Créer
            </button>
            <button className="add-board-cancel" type="button" onClick={() => setUniDraft(null)}>
              Annuler
            </button>
          </form>
        )}
      </div>

      {sheet?.kind === 'board' && (() => {
        const b = store.boards.find((x) => x.id === sheet.id);
        if (!b) return null;
        const list = boardsOf(b.universe_id);
        return (
          <div className="sheet-backdrop" onClick={closeSheet}>
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Actions pour « ${b.name} »`}
              tabIndex={-1}
              ref={sheetRef}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSheet();
              }}
            >
              <p className="sheet__title">{b.name}</p>
              {/* Le glisser-déposer HTML5 ne fonctionne pas au doigt : sans ces
                  entrées, réordonner ET ranger seraient impossibles sur mobile. */}
              <button
                className="sheet__item"
                disabled={list[0]?.id === b.id}
                onClick={() => {
                  move(b.id, -1);
                  closeSheet();
                }}
              >
                ↑ Monter
              </button>
              <button
                className="sheet__item"
                disabled={list[list.length - 1]?.id === b.id}
                onClick={() => {
                  move(b.id, 1);
                  closeSheet();
                }}
              >
                ↓ Descendre
              </button>
              {grouped && (
                <>
                  <p className="sheet__label">Déplacer vers un univers</p>
                  {store.universes.map((u) => (
                    <button
                      key={u.id}
                      className="sheet__item"
                      disabled={b.universe_id === u.id}
                      onClick={() => {
                        void store.moveBoard(b.id, u.id, null);
                        closeSheet();
                      }}
                    >
                      {u.name}
                    </button>
                  ))}
                  <button
                    className="sheet__item"
                    disabled={b.universe_id === null}
                    onClick={() => {
                      void store.moveBoard(b.id, null, null);
                      closeSheet();
                    }}
                  >
                    Sans univers
                  </button>
                </>
              )}
              <button
                className="sheet__item"
                onClick={() => {
                  setEditing({ id: b.id, name: b.name });
                  closeSheet();
                }}
              >
                Renommer
              </button>
              <button
                className="sheet__item sheet__item--danger"
                onClick={() => {
                  setToDelete(b.id);
                  closeSheet();
                }}
              >
                Supprimer
              </button>
              <button className="sheet__item sheet__item--cancel" onClick={closeSheet}>
                Annuler
              </button>
            </div>
          </div>
        );
      })()}

      {/* Le pendant de la feuille des matrices pour les univers. Elle répare un
          trou : `.uni-head__actions` étant masqué au doigt, un univers n'était
          sur mobile ni réordonnable, ni renommable, ni supprimable. */}
      {sheet?.kind === 'universe' && (() => {
        const u = uniOrder.find((x) => x.id === sheet.id);
        if (!u) return null;
        const first = uniOrder[0]?.id === u.id;
        const last = uniOrder[uniOrder.length - 1]?.id === u.id;
        return (
          <div className="sheet-backdrop" onClick={closeSheet}>
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Actions pour l'univers « ${u.name} »`}
              tabIndex={-1}
              ref={sheetRef}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSheet();
              }}
            >
              <p className="sheet__title">{u.name}</p>
              {/* Aux bornes, l'entrée reste visible mais inerte : une feuille
                  dont les lignes bougent d'un univers à l'autre se relit à
                  chaque ouverture. Même parti que celle des matrices. */}
              <button
                className="sheet__item"
                disabled={first}
                onClick={() => {
                  moveUniverse(u.id, -1);
                  closeSheet();
                }}
              >
                ↑ Monter
              </button>
              <button
                className="sheet__item"
                disabled={last}
                onClick={() => {
                  moveUniverse(u.id, 1);
                  closeSheet();
                }}
              >
                ↓ Descendre
              </button>
              {/* Pas d'entrée « Replier » : le chevron, lui, est atteignable au
                  doigt — il n'a rien à faire ici. */}
              <button
                className="sheet__item"
                onClick={() => {
                  setEditingUni({ id: u.id, name: u.name });
                  closeSheet();
                }}
              >
                Renommer
              </button>
              <button
                className="sheet__item sheet__item--danger"
                onClick={() => {
                  setUniToDelete(u.id);
                  closeSheet();
                }}
              >
                Supprimer
              </button>
              <button className="sheet__item sheet__item--cancel" onClick={closeSheet}>
                Annuler
              </button>
            </div>
          </div>
        );
      })()}

      {doomed && (
        <Confirm
          title={`Supprimer « ${doomed.name} » ?`}
          body={
            doomedCount > 0
              ? `${doomedCount > 1 ? `Ses ${doomedCount} tâches seront supprimées` : 'Sa tâche sera supprimée'} avec elle, corbeille comprise. C'est définitif.`
              : "Cette matrice est vide. C'est définitif."
          }
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const id = doomed.id;
            setToDelete(null);
            void store.deleteBoard(id);
          }}
        />
      )}

      {doomedUni && (
        <Confirm
          title={`Supprimer l'univers « ${doomedUni.name} » ?`}
          // Rien ne se perd : `on delete set null` délie les matrices au lieu de
          // les emporter. D'où le ton neutre — ce n'est pas une destruction.
          body={
            doomedUniCount > 0
              ? `Ses ${doomedUniCount} matrice${doomedUniCount > 1 ? 's' : ''} ne ${doomedUniCount > 1 ? 'seront' : 'sera'} pas supprimée${doomedUniCount > 1 ? 's' : ''} : elle${doomedUniCount > 1 ? 's repasseront' : ' repassera'} sans univers.`
              : "Cet univers est vide."
          }
          confirmLabel="Supprimer l'univers"
          tone="neutral"
          onCancel={() => setUniToDelete(null)}
          onConfirm={() => {
            const id = doomedUni.id;
            setUniToDelete(null);
            void store.deleteUniverse(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Interstice entre deux univers.
 *
 * De hauteur **nulle** au repos, là où `BoardGap` en fait dix : les univers sont
 * déjà espacés par le `padding` de leur en-tête, et en insérer dix pixels avant
 * chacun changerait l'accueil pour tout le monde — y compris pour qui ne glisse
 * jamais rien. Il ne prend de la place qu'une fois désigné.
 */
function UniGap({ active }: { active: boolean }) {
  return (
    <div className={`uni-gap${active ? ' uni-gap--active' : ''}`}>
      <div className="uni-gap__line" />
    </div>
  );
}

/**
 * Ce qu'annonce un en-tête replié : « 3 matrices · 12 tâches ».
 *
 * Les petits nombres se disent en mots plutôt qu'en chiffres — « 0 tâche » se lit
 * mal, et « 0 matrice » encore plus mal. Un univers vide n'a rien à chiffrer : il
 * est simplement vide, et le dire suffit.
 */
function foldLabel({ boards, tasks }: UniverseSummary): string {
  if (boards === 0) return 'vide';
  const left = `${boards} matrice${boards > 1 ? 's' : ''}`;
  const right = tasks > 0 ? `${tasks} tâche${tasks > 1 ? 's' : ''}` : 'rien à faire';
  return `${left} · ${right}`;
}

/**
 * Interstice entre deux matrices — un repère, plus une cible.
 *
 * Il portait jusqu'ici ses propres gestionnaires de dépôt, ce qui revenait à
 * demander au curseur de viser 10 px : hors de cette bande, plus rien
 * n'acceptait le dépôt et le navigateur annulait le déplacement. Le dépôt vit
 * désormais sur la ligne et sur le groupe ; il ne reste ici que l'affichage.
 *
 * Replié au repos pour ne rien coûter en hauteur, il s'ouvre quand il est
 * désigné — même mécanique que les `.row-gap` de l'écran matrice, pour que les
 * deux listes se manipulent pareil.
 */
function BoardGap({ active }: { active: boolean }) {
  return (
    <div className={`board-gap${active ? ' board-gap--active' : ''}`}>
      <div className="board-gap__line" />
    </div>
  );
}
