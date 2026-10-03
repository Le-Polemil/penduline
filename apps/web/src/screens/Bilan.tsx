import type { Store } from '../data/store';
import { ReviewScreen } from './Review';
import { StatsScreen } from './Stats';
import { GoalsScreen } from './Goals';

/**
 * Les trois lectures du recul. L'ordre est celui de la bande d'onglets, et il
 * va du constat à la règle : ce qui s'est passé, ce qu'il faut décider, et ce
 * que ça dit de la méthode.
 */
export type BilanTab = 'retro' | 'review' | 'goals';

const ONGLETS: { key: BilanTab; label: string }[] = [
  { key: 'retro', label: 'Rétrospective' },
  { key: 'review', label: 'Revue' },
  { key: 'goals', label: 'Objectifs' },
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
          aria-selected={o.key === tab}
          onClick={() => onTab(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  if (tab === 'review') return <ReviewScreen store={store} tabs={tabs} onOpenBoard={onOpenBoard} />;
  if (tab === 'goals') return <GoalsScreen store={store} tabs={tabs} />;
  return <StatsScreen store={store} tabs={tabs} onReview={() => onTab('review')} />;
}
