/**
 * Service worker MV3.
 *
 * Porte la capture depuis la page consultée : un menu contextuel qui crée une
 * tâche dans « À trier », et l'ouverture du panneau latéral sur le formulaire.
 *
 * Deux contraintes façonnent ce fichier :
 *
 * 1. `chrome.contextMenus` exige que les entrées soient enregistrées À L'AVANCE :
 *    impossible d'aller chercher la liste des matrices au moment du clic droit.
 *    Plutôt que de faire interroger Supabase par le worker — qui peut être tué à
 *    tout moment — c'est le panneau qui lui transmet la liste qu'il a déjà
 *    chargée. Un cache `chrome.storage.local` couvre le démarrage à froid, avant
 *    toute ouverture du panneau.
 *
 * 2. Le retour à l'utilisateur passe par le BADGE de l'icône, pas par
 *    `chrome.notifications`, qui coûterait une permission de plus. Le manifeste
 *    est resté minimal à dessein (cf. work/publication-extension.md) : il n'y a
 *    pas de raison de l'entamer pour un accusé de réception.
 */
import { supabase, isConfigured } from './supabase';
import { getActiveBoard } from './active-board';
import { clearPending, setPending } from './pending-capture';
import { listenForSharedSession } from './session-bridge';

/** Liste des matrices, alimentée par le panneau. */
const BOARDS_KEY = 'penduline-boards-cache';

type CachedBoard = { id: string; name: string };

const ROOT_ACTIVE = 'penduline-add-active';
const ROOT_OTHER = 'penduline-add-other';
/** Contextes où l'entrée apparaît : une sélection, un lien, ou la page nue. */
const CONTEXTS: chrome.contextMenus.ContextType[] = ['selection', 'link', 'page'];

// ── Badge ────────────────────────────────────────────────────────────────────

let clearTimer: number | undefined;

function flash(text: string, color: string, title: string) {
  void chrome.action.setBadgeBackgroundColor({ color });
  void chrome.action.setBadgeText({ text });
  void chrome.action.setTitle({ title });
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    void chrome.action.setBadgeText({ text: '' });
    void chrome.action.setTitle({ title: 'Penduline' });
  }, 2500) as unknown as number;
}

// ── Menus ────────────────────────────────────────────────────────────────────

async function readBoards(): Promise<CachedBoard[]> {
  try {
    const res = await chrome.storage.local.get(BOARDS_KEY);
    return (res[BOARDS_KEY] as CachedBoard[] | undefined) ?? [];
  } catch {
    return [];
  }
}

/**
 * Crée une entrée en ACCUSANT réception de l'échec.
 *
 * `chrome.contextMenus.create` ne rend pas de promesse : sans rappel, un échec
 * atterrit dans `chrome.runtime.lastError` que personne ne lit, et Chrome
 * l'imprime en « Unchecked runtime.lastError » dans la console de
 * l'utilisateur — ce qui se lit comme un plantage de l'extension. Le rappel
 * n'est pas là pour étouffer l'erreur mais pour la rendre NOTRE ligne de log,
 * au même format que le reste du fichier.
 */
function createItem(props: chrome.contextMenus.CreateProperties) {
  chrome.contextMenus.create(props, () => {
    const err = chrome.runtime.lastError;
    if (err) console.error('[penduline] menu', props.id, err.message);
  });
}

/**
 * Reconstruit le menu de zéro.
 *
 * ⚠️ **L'ordre des lectures est le correctif de #105, et il n'est pas
 * cosmétique.** `removeAll` était appelé d'abord, puis venaient DEUX `await`
 * (le cache des matrices, la matrice active) avant le premier `create`. Deux
 * reconstructions qui se chevauchaient passaient donc toutes les deux le
 * `removeAll`, puis arrivaient toutes les deux sur `ROOT_ACTIVE` : la seconde
 * échouait sur « Cannot create item with duplicate id », et le menu restait
 * amputé de tout ce qui suivait.
 *
 * Les lectures passent donc AVANT. Après l'unique `await` restant — celui de
 * `removeAll` — tous les `create` s'enchaînent **dans le même tour de boucle**,
 * sans point de suspension entre eux : aucune autre reconstruction ne peut
 * s'insérer au milieu. La fenêtre disparaît par construction, et non par chance
 * d'ordonnancement.
 *
 * C'est CE changement qui corrige le défaut. `rebuildMenus` sérialise par
 * ailleurs, et achète autre chose : sans lui, trois appels concurrents ne
 * collisionnent plus mais se piétinent quand même — chacun efface les entrées
 * que le précédent venait de poser, pour les reposer à l'identique. L'état final
 * est juste, le travail est fait trois fois, et le menu clignote entre-temps.
 */
async function buildMenus() {
  // Lues d'abord — voir l'avertissement ci-dessus.
  const boards = await readBoards();
  const activeId = await getActiveBoard();
  const active = boards.find((b) => b.id === activeId) ?? boards[0];

  // À partir d'ici, plus aucun `await` jusqu'au dernier `create`.
  await chrome.contextMenus.removeAll();

  createItem({
    id: ROOT_ACTIVE,
    // Sans matrice connue, on reste générique : l'utilisateur découvrira la
    // destination au premier usage plutôt que de lire un nom faux.
    title: active ? `Ajouter à « ${active.name} »` : 'Ajouter à Penduline',
    contexts: CONTEXTS,
  });

  const others = boards.filter((b) => b.id !== active?.id);
  if (others.length > 0) {
    createItem({ id: ROOT_OTHER, title: 'Autre matrice', contexts: CONTEXTS });
    for (const b of others) {
      createItem({
        id: `${ROOT_OTHER}:${b.id}`,
        parentId: ROOT_OTHER,
        title: b.name,
        contexts: CONTEXTS,
      });
    }
  }
}

/**
 * Le seul point d'entrée pour reconstruire le menu. **Ne jamais appeler
 * `buildMenus` directement.**
 *
 * Trois choses le déclenchent — `onInstalled`, `onStartup`, et le message
 * `boards` que le panneau pousse à chaque chargement — et à l'installation sur
 * un profil neuf, plusieurs tombent à quelques millisecondes d'intervalle.
 *
 * ⚠️ Ce n'est PAS ici que #105 est corrigé : c'est l'ordre des lectures dans
 * `buildMenus` qui ferme la collision. La file évite le gâchis restant — trois
 * appels concurrents qui s'effacent l'un l'autre pour reconstruire trois fois le
 * même menu — et garantit un seul écrivain à la fois, ce qui rend le prochain
 * point d'appel sans danger.
 *
 * Une chaîne de promesses plutôt qu'un vrai verrou : une reconstruction, c'est
 * deux lectures de stockage et une poignée de `create`. En rejouer une de trop
 * ne se mesure pas, alors que coalescer demanderait un état à tenir juste.
 *
 * Le `catch` porte sur le maillon PRÉCÉDENT : sans lui, une reconstruction qui
 * échoue empoisonne la chaîne et aucune suivante ne partirait jamais.
 */
let file: Promise<unknown> = Promise.resolve();

function rebuildMenus(): Promise<void> {
  file = file.catch(() => {}).then(buildMenus);
  return file as Promise<void>;
}

// ── Capture ──────────────────────────────────────────────────────────────────

/**
 * Ce qu'on capture, par ordre de précision : la sélection de l'utilisateur, à
 * défaut le texte ou l'URL du lien visé, à défaut le titre de la page.
 */
function titleFrom(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): string {
  const raw = info.selectionText?.trim() || info.linkUrl?.trim() || tab?.title?.trim() || '';
  // La colonne `title` est bornée à 500 caractères (contrainte `tasks_title_check`) :
  // on tronque ici plutôt que de laisser l'insertion échouer.
  return raw.replace(/\s+/g, ' ').slice(0, 500);
}

/**
 * Le lien qu'on retient : celui qu'on a visé, à défaut la page où l'on est.
 *
 * C'était le manque de #52 : `titleFrom` se servait de `linkUrl` comme d'un
 * titre de repli, donc le lien disparaissait dès qu'il y avait une sélection —
 * c'est-à-dire dans le cas le plus fréquent, et le plus utile.
 */
function urlFrom(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): string {
  const raw = info.linkUrl?.trim() || info.pageUrl?.trim() || tab?.url?.trim() || '';
  // Une page interne (`chrome://`, `about:`) n'est un lien pour personne, et la
  // base la refuserait de toute façon.
  return /^https?:\/\//i.test(raw) ? raw.slice(0, 2048) : '';
}

async function capture(boardId: string | null, title: string, url = '') {
  if (!isConfigured) return flash('!', '#a63d2a', 'Penduline — configuration manquante');
  if (!title) return flash('!', '#a63d2a', 'Penduline — rien à capturer ici');

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    // Le pire scénario serait de perdre la tâche en silence : l'utilisateur
    // croirait avoir capturé quelque chose.
    return flash('!', '#a63d2a', 'Penduline — connectez-vous pour capturer');
  }

  const target = boardId ?? (await getActiveBoard());
  if (!target) return flash('!', '#a63d2a', 'Penduline — aucune matrice où ranger ceci');

  // Position en fin de case : on lit le maximum existant plutôt que de deviner.
  // Un aller-retour de plus, mais l'ordre reste cohérent avec celui du panneau.
  const { data: last } = await supabase
    .from('tasks')
    .select('position')
    .eq('board_id', target)
    .eq('quadrant', 'parking')
    .order('position', { ascending: false })
    .limit(1);
  const position = ((last?.[0]?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase.from('tasks').insert({
    user_id: userId,
    board_id: target,
    title,
    // Ce qui arrive par un canal automatique n'a par définition pas été classé —
    // et « À trier » existe exactement pour ça.
    quadrant: 'parking',
    position,
  })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[penduline] capture', error?.message);
    return flash('!', '#a63d2a', 'Penduline — échec de la capture');
  }

  // Le lien est attaché APRÈS, et son échec ne condamne pas la tâche : mieux
  // vaut une tâche sans son lien qu'une capture perdue. Le `check` de la base
  // refuse tout ce qui n'est pas `http(s)`, d'où le filtrage de `urlFrom`.
  if (url) {
    const { error: lien } = await supabase
      .from('task_attachments')
      .insert({ task_id: data.id, user_id: userId, url, position: 0 });
    if (lien) console.error('[penduline] pièce jointe', lien.message);
  }

  flash('✓', '#5c6b45', 'Penduline — tâche ajoutée à « À trier »');
}

// ── Branchements ─────────────────────────────────────────────────────────────

/**
 * Le clic sur l'icône ouvre le panneau — sans écouteur à maintenir.
 *
 * C'est ce que remplace le retrait de `action.default_popup` du manifeste : tant
 * qu'il y était, il gagnait sur tout le reste et cette préférence n'avait aucun
 * effet. Déclarée aux deux événements comme `rebuildMenus`, parce que le worker
 * MV3 est tué en permanence et qu'aucun des deux seul ne couvre tous les
 * réveils.
 */
function preferPanel() {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e: unknown) => console.error('[penduline] panneau', e));
}

chrome.runtime.onInstalled.addListener(() => {
  preferPanel();
  void rebuildMenus();
});
chrome.runtime.onStartup.addListener(() => {
  preferPanel();
  void rebuildMenus();
});

/** Le panneau pousse la liste des matrices à chaque chargement. */
chrome.runtime.onMessage.addListener((msg: { type?: string; boards?: CachedBoard[] }) => {
  if (msg?.type !== 'boards' || !Array.isArray(msg.boards)) return;
  void (async () => {
    await chrome.storage.local.set({ [BOARDS_KEY]: msg.boards });
    await rebuildMenus();
  })();
});

/**
 * L'app web nous transmet sa session : se connecter d'un côté connecte l'autre.
 *
 * Posé au niveau du module, comme les autres branchements du worker : MV3 exige
 * que les écouteurs soient enregistrés au premier tour de boucle, sinon
 * l'événement qui réveille le worker se perd avant que quiconque l'écoute.
 *
 * Le retrait renvoyé n'a pas d'usage ici — un service worker ne se démonte pas,
 * il est tué. C'est le panneau qui s'en sert (`App.tsx`).
 */
listenForSharedSession();

/**
 * Le clic sur une entrée de menu ouvre le formulaire (#78).
 *
 * ⚠️ **L'ouverture passe en premier, et c'est contre-intuitif.**
 * `chrome.sidePanel.open()` exige un geste utilisateur, et la fenêtre de geste
 * se referme au premier `await` : la dérouler après `setPending` ou après
 * `getActiveBoard` la ferait échouer *systématiquement*. On ouvre donc d'abord,
 * on prépare ensuite.
 *
 * La contrepartie est une course — le panneau peut se monter avant que la
 * capture ne soit déposée. Elle est absorbée côté interface, qui écoute
 * `chrome.storage.session` au lieu de ne lire qu'au montage (voir `App.tsx`).
 * C'est le même mécanisme qui traite le cas nouveau d'une capture reçue
 * **panneau déjà ouvert**, impossible du temps du popup puisqu'il se fermait au
 * premier clic dans la page.
 *
 * Le repli ne change pas de nature : si l'ouverture échoue, on écrit
 * directement. C'est le point non négociable — une capture perdue en silence
 * serait pire que l'absence de formulaire. Et la capture en attente est
 * nettoyée, faute de quoi le formulaire s'afficherait à la prochaine ouverture
 * manuelle, pour une capture déjà écrite.
 */
async function demander(boardId: string | null, info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  const title = titleFrom(info, tab);
  const url = urlFrom(info, tab);

  // ⚠️ Aucun `await` avant cette ligne : c'est la condition du geste utilisateur.
  // `windowId` plutôt que `tabId` : le panneau vaut pour la fenêtre entière, et
  // le viser par onglet le ferait disparaître au premier changement d'onglet.
  // Le résultat est réduit à un booléen TOUT DE SUITE : laisser une promesse
  // rejetable en vol pendant les deux `await` qui suivent produirait un rejet
  // non traité, que MV3 remonte en erreur de service worker.
  const ouvert = tab?.windowId
    ? chrome.sidePanel.open({ windowId: tab.windowId }).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);

  // ⚠️ `null` est résolu ICI, pas dans le formulaire : l'entrée « Ajouter à
  // « X » » annonce un nom, et le formulaire doit montrer CE nom. Le laisser
  // à `null` faisait retomber la sélection sur la première matrice de la liste,
  // c'est-à-dire sur une destination que rien n'avait annoncée.
  const cible = boardId ?? (await getActiveBoard());
  await setPending({ title, url, boardId: cible, at: Date.now() });

  if (!(await ouvert)) {
    await clearPending();
    await capture(boardId, title, url);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  if (id === ROOT_ACTIVE) return void demander(null, info, tab);
  if (id.startsWith(`${ROOT_OTHER}:`)) {
    return void demander(id.slice(ROOT_OTHER.length + 1), info, tab);
  }
});
