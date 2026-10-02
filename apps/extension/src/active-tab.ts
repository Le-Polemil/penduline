/**
 * L'onglet que l'utilisateur regarde — la source de « Capturer cette page ».
 *
 * ⚠️ **Demande la permission `tabs`** (ajoutée au manifeste avec cette
 * fonction). `activeTab` ne suffit pas : elle n'est accordée qu'au moment où
 * l'utilisateur invoque l'extension, et le panneau latéral reste ouvert pendant
 * qu'on change d'onglet — c'est même tout son intérêt. Au moment où l'on appuie
 * sur « Capturer cette page », l'onglet visé n'est presque jamais celui qui a
 * ouvert le panneau.
 *
 * Conséquence à assumer : la fiche du Chrome Web Store change et la validation
 * repart (voir `work/publication-extension.md`).
 *
 * `lastFocusedWindow` et non `currentWindow` : le panneau EST dans la fenêtre
 * courante, mais une capture déclenchée depuis une fenêtre détachée doit viser
 * l'onglet qu'on vient de quitter des yeux, pas celui d'à côté.
 */
export interface ActiveTab {
  title: string;
  url: string;
}

/** Les schémas qu'on ne capture pas : il n'y a rien à ouvrir derrière. */
const INTERNE = /^(chrome|chrome-extension|edge|about|devtools|view-source):/i;

export async function getActiveTab(): Promise<ActiveTab | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return null;
    const url = tab.url ?? '';
    // Une page interne au navigateur donne un lien que personne ne pourra
    // rouvrir : on garde le titre et on jette l'URL, plutôt que de refuser la
    // capture — le titre reste une tâche valable.
    return { title: tab.title ?? '', url: INTERNE.test(url) ? '' : url };
  } catch {
    // Pas de `chrome.tabs` (aperçu web), ou permission refusée : le bouton
    // reste, la capture part sur un formulaire vide. Mieux qu'un bouton mort.
    return null;
  }
}
