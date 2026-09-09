import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ALL,
  groupByUniverse,
  type Board,
  type QuadrantKey,
  type Task,
  type Universe,
} from '@penduline/shared';
import { IconAlarmClock, IconPenLine } from './Icons';
import { quadBg } from './quad-bg';

/** Marge conservée entre le menu et le bord de la liste qui défile. */
const MARGE = 8;
/**
 * Hauteur en dessous de laquelle on cesse de rétrécir le menu.
 *
 * Sans plancher, un panneau très court réduirait le menu à deux lignes et une
 * barre de défilement — illisible. Passé ce seuil on préfère dépasser un peu :
 * un menu tronqué reste utilisable, un menu de 40 px ne l'est plus.
 */
const PLANCHER = 140;

/** Où le menu tient, et sur quelle hauteur. `null` = pas encore mesuré. */
interface Place {
  /** Ancré au-dessus de la carte plutôt qu'en dessous. */
  up: boolean;
  maxH: number;
}

/**
 * Le menu `⋯` d'une tâche du panneau.
 *
 * Il reprend la structure de celui du web (`apps/web/src/components/TaskCard.tsx`),
 * qui a été réordonné en #110 puis aligné sur celui des matrices en #114 : même
 * ordre — classer, déplacer, enrichir, puis les gestes rares — mêmes libellés,
 * mêmes séparateurs, mêmes icônes. Deux menus qui font la même chose doivent se
 * lire de la même façon, et celui du panneau était resté à l'ordre d'avant.
 *
 * Deux écarts, tous deux imposés par l'hôte et non par le goût :
 *
 * 1. **Les univers se déplient EN PLACE**, sans sous-menu flottant. Chrome
 *    laisse réduire le panneau à ~240 px et le menu occupe déjà `min(210px, 100%)` :
 *    il ne reste pas 150 px sur le côté pour un `flyout`. C'est exactement le
 *    repli que le web applique déjà au doigt (`@media (hover: none)`).
 * 2. **La hauteur est bornée par la mesure**, pas seulement retournée. Le web se
 *    contente de basculer vers le haut (#114) parce que sa page a toujours de la
 *    place quelque part ; ici la liste des cases défile dans un conteneur qui
 *    ROGNE le menu, et une pile d'univers peut à elle seule dépasser la hauteur
 *    visible. Retourner ne suffirait donc pas.
 *
 * Le composant existe parce que ces deux mécaniques demandent des hooks par
 * menu — mesure, clic à côté, univers ouvert. Rendues à l'intérieur de la
 * boucle de l'écran, elles auraient dû vivre dans un état indexé par tâche.
 */
export function TaskMenu({
  task,
  quad,
  boards,
  universes,
  onMoveQuad,
  onMoveBoard,
  onDeadline,
  onRename,
  onClose,
}: {
  task: Task;
  /** La case actuelle : son bouton se grise, on n'y « affecte » pas deux fois. */
  quad: QuadrantKey;
  /** Les matrices proposées, la sienne déjà exclue par l'appelant. */
  boards: Board[];
  /** Aucun univers — ou un seul groupe — et la liste reste PLATE, comme le web. */
  universes: Universe[];
  onMoveQuad: (key: QuadrantKey) => void;
  onMoveBoard: (board: Board) => void;
  onDeadline: () => void;
  onRename: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  /** L'univers déplié. `null` = aucun ; un seul à la fois. */
  const [openUni, setOpenUni] = useState<string | null>(null);

  /**
   * Placer le menu dans la place réellement disponible.
   *
   * ⚠️ Le cadre de référence est `.detail-list`, PAS la fenêtre. Le menu est
   * absolu à l'intérieur d'un conteneur `overflow: auto` : c'est ce conteneur
   * qui le coupe, et son bord inférieur arrive bien avant celui de l'écran.
   * Mesurer contre `window.innerHeight` — ce que fait le menu des matrices côté
   * web, où la page entière défile — laisserait le menu tronqué sans le savoir.
   *
   * `useLayoutEffect` : la mesure doit précéder la peinture, sinon le menu
   * s'affiche une image au mauvais endroit avant de sauter.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    const ancre = el?.parentElement;
    if (!el || !ancre) return;
    const carte = ancre.getBoundingClientRect();
    const liste = ancre.closest('.detail-list')?.getBoundingClientRect();
    const dessous = (liste?.bottom ?? window.innerHeight) - carte.bottom - MARGE;
    const dessus = carte.top - (liste?.top ?? 0) - MARGE;
    // On ne retourne que si ça ne tient pas en dessous ET qu'il y a mieux
    // au-dessus : sinon on remplacerait un débordement par un autre.
    const up = el.scrollHeight > dessous && dessus > dessous;
    setPlace({ up, maxH: Math.max(up ? dessus : dessous, PLANCHER) });
  }, []);

  /**
   * Fermer au clic à côté et à Échap — ni l'un ni l'autre n'existait dans le
   * panneau : ouvert par erreur, le menu ne se refermait qu'en CHOISISSANT une
   * action.
   *
   * `pointerdown` et non `click`, pour qu'il disparaisse dès l'appui : attendre
   * le relâchement le laisse visible pendant tout un glisser, or la carte qu'il
   * surplombe est précisément déplaçable.
   */
  useEffect(() => {
    function dehors(e: PointerEvent) {
      const cible = e.target as Node;
      if (ref.current?.contains(cible)) return;
      // Le `⋯` qui a ouvert le menu n'est PAS « à côté » : c'est lui qui bascule.
      // Sans cette exception, l'appui fermait le menu puis le clic le rouvrait
      // aussitôt — le bouton n'aurait plus jamais servi qu'à ouvrir. Le `⋯` d'une
      // AUTRE tâche continue de fonctionner : il réaffecte le menu ouvert.
      const el = cible instanceof Element ? cible : cible.parentElement;
      if (el?.closest('.task__more')) return;
      onClose();
    }
    function echap(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [onClose]);

  /**
   * Les matrices rangées par univers, groupes vides écartés.
   * `groupByUniverse` place déjà « sans univers » en dernier (#62).
   */
  const groupes = groupByUniverse(universes, boards).filter((g) => g.boards.length > 0);

  return (
    <div
      className={`task-menu${place?.up ? ' task-menu--up' : ''}`}
      ref={ref}
      // Pas de `role="menu"` : il exige des enfants `menuitem` et une navigation
      // aux flèches, que ni ce menu ni celui du web n'implémentent. Un rôle
      // annoncé mais pas tenu désoriente plus qu'il n'aide ; le libellé, lui,
      // manquait vraiment — le glyphe seul nommait le menu « ⋯ ».
      aria-label={`Actions pour « ${task.title} »`}
      // Mesurée, la hauteur est imposée en ligne : elle dépend de la position de
      // la carte dans la liste, ce qu'aucune feuille de style ne peut savoir.
      style={place ? ({ maxHeight: `${place.maxH}px` } as CSSProperties) : undefined}
    >
      {/* L'ORDRE SUIT CE QU'ON Y FAIT LE PLUS, comme sur le web : classer
          d'abord — c'est le geste de la matrice, celui pour lequel on ouvre ce
          menu — puis déplacer, puis enrichir. Les gestes rares finissent en bas,
          où l'on ne clique pas par accident. « Renommer », qui ouvrait le menu,
          est passé dernier. */}
      <div className="task-menu__label">Affecter à</div>
      <div className="task-menu__grid">
        {ALL.map((b) => (
          <button
            key={b.key}
            className="move-btn"
            style={{ background: quadBg(b), color: b.dark }}
            disabled={b.key === quad}
            onClick={() => onMoveQuad(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* « Déplacer vers » et non « Vers une autre matrice » : le mot du web,
          pour que les deux menus s'énoncent pareil.
          Les matrices sont RANGÉES PAR UNIVERS, dans l'ordre de l'accueil. La
          liste plate tenait tant qu'on avait trois matrices ; passé quelques
          univers elle n'a plus ni ordre ni repère — et dans 240 px de panneau,
          elle poussait le menu hors de la vue à elle seule. */}
      {boards.length > 0 && (
        <>
          <div className="task-menu__sep" role="separator" />
          <div className="task-menu__label">Déplacer vers</div>
          {groupes.length <= 1 ? (
            <div className="task-menu__boards">
              {boards.map((b) => (
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
                >
                  {/* Au clic seul, sans ouverture au survol : le panneau se
                      manipule aussi bien au pavé tactile qu'au doigt, et un
                      dépliage en place qui s'ouvre au passage du pointeur fait
                      sauter tout ce qui est en dessous. */}
                  <button
                    className="task-menu__action task-menu__uni-head"
                    aria-expanded={ouvert}
                    onClick={() => setOpenUni(ouvert ? null : cle)}
                  >
                    {/* « Sans univers » plutôt que « Autre » : le mot que
                        l'accueil du panneau emploie déjà pour ce groupe. */}
                    {g.universe?.name ?? 'Sans univers'}
                    <span className="task-menu__caret" aria-hidden="true">
                      {ouvert ? '⌄' : '›'}
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
      <button className="task-menu__action" onClick={onDeadline}>
        <IconAlarmClock size={13} />
        {task.due_at ? 'Modifier l’échéance' : 'Fixer une échéance'}
      </button>

      <div className="task-menu__sep" role="separator" />
      <button className="task-menu__action" onClick={onRename}>
        <IconPenLine size={13} />
        Renommer
      </button>
    </div>
  );
}
