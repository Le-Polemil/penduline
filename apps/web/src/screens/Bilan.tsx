import type { Store } from '../data/store';
import { ReviewScreen } from './Review';
import { StatsScreen } from './Stats';

/**
 * Les lectures du recul. L'ordre est celui de la bande d'onglets.
 *
 * ⚠️ `'goals'` — « Objectifs » — est DÉCLARÉ mais pas encore offert, et il est
 * volontairement absent d'`ONGLETS`. Le barème du brief (Faire +1 si fait en
 * 7 jours, Déléguer +3 si validée quand Faire est vide…) ne se calcule pas avec
 * le schéma d'aujourd'hui : il demande l'historique des complétions, que le
 * client ne charge pas (#40), et pour « Déléguer » l'état de « Faire » À
 * L'INSTANT de la validation, qu'aucune table ne conserve. Le type l'accepte
 * pour que la vue persistée d'un onglet futur ne casse rien ; l'aiguillage
 * retombe sur la rétrospective tant qu'il n'existe pas.
 */
export type BilanTab = 'retro' | 'review' | 'goals';

const ONGLETS: { key: BilanTab; label: string }[] = [
  { key: 'retro', label: 'Rétrospective' },
  { key: 'review', label: 'Revue' },
];

/**
 * « Bilan » : les trois écrans qui font prendre du recul, sous une seule entrée.
 *
 * Ils avaient chacun leur place dans la navigation, et c'était deux problèmes
 * en un. Le premier est de place : la barre d'onglets du téléphone n'a que cinq
 * emplacements, et « Objectifs » aurait été le sixième. Le second est de sens —
 * on ne va pas « à la Revue » ni « à la Rétrospective » comme on va à une
 * matrice : on va regarder en arrière, et on choisit ensuite AVEC QUOI. Les
 * trois répondent à la même intention et se lisent à la suite.
 *
 * ⚠️ « Bilan » et non « Stats ». La Revue est une pile de DÉCISIONS, pas une
 * statistique : la ranger sous une étiquette qui annonce des chiffres la ferait
 * chercher ailleurs. « Bilan » couvre les trois sans mentir sur aucun.
 *
 * L'aiguillage et rien d'autre : chaque onglet reste un écran autonome, avec son
 * état, ses données et son bandeau. La bande d'onglets leur est passée en
 * `tabs` et vient se poser en tête de ce bandeau — au-dessus du titre, parce
 * qu'elle le change.
 */
export function BilanScreen({
  store,
  tab,
  onTab,
  onOpenBoard,
}: {
  store: Store;
  tab: BilanTab;
  onTab: (tab: BilanTab) => void;
  onOpenBoard: (boardId: string, taskId?: string) => void;
}) {
  const tabs = (
    <div className="btabs" role="tablist" aria-label="Bilan">
      {ONGLETS.map((o) => (
        <button
          key={o.key}
          className="btabs__tab"
          role="tab"
          aria-selected={o.key === tab || (tab === 'goals' && o.key === 'retro')}
          onClick={() => onTab(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  if (tab === 'review') return <ReviewScreen store={store} tabs={tabs} onOpenBoard={onOpenBoard} />;
  return <StatsScreen store={store} tabs={tabs} onReview={() => onTab('review')} />;
}
