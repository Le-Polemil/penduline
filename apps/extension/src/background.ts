/**
 * Service worker MV3.
 *
 * Porte la capture depuis la page consultée : un menu contextuel qui crée une
 * tâche dans « À trier » sans jamais ouvrir le popup.
 *
 * Deux contraintes façonnent ce fichier :
 *
 * 1. `chrome.contextMenus` exige que les entrées soient enregistrées À L'AVANCE :
 *    impossible d'aller chercher la liste des matrices au moment du clic droit.
 *    Plutôt que de faire interroger Supabase par le worker — qui peut être tué à
 *    tout moment — c'est le popup qui lui transmet la liste qu'il a déjà chargée.
 *    Un cache `chrome.storage.local` couvre le démarrage à froid, avant toute
 *    ouverture du popup.
 *
 * 2. Le retour à l'utilisateur passe par le BADGE de l'icône, pas par
 *    `chrome.notifications`, qui coûterait une permission de plus. Le manifeste
 *    est resté minimal à dessein (cf. work/publication-extension.md) : il n'y a
 *    pas de raison de l'entamer pour un accusé de réception.
 */
import { supabase, isConfigured } from './supabase';
import { getActiveBoard } from './active-board';
import { clearPending, setPending } from './pending-capture';

/** Liste des matrices, alimentée par le popup. */
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
 * Reconstruit le menu de zéro. `removeAll` d'abord : `create` lève si un
 * identifiant existe déjà, et le worker peut redémarrer avec des menus encore
 * enregistrés.
 */
async function buildMenus() {
  await chrome.contextMenus.removeAll();

  const boards = await readBoards();
  const activeId = await getActiveBoard();
  const active = boards.find((b) => b.id === activeId) ?? boards[0];

  chrome.contextMenus.create({
    id: ROOT_ACTIVE,
    // Sans matrice connue, on reste générique : l'utilisateur découvrira la
    // destination au premier usage plutôt que de lire un nom faux.
    title: active ? `Ajouter à « ${active.name} »` : 'Ajouter à Penduline',
    contexts: CONTEXTS,
  });

  const others = boards.filter((b) => b.id !== active?.id);
  if (others.length > 0) {
    chrome.contextMenus.create({ id: ROOT_OTHER, title: 'Autre matrice', contexts: CONTEXTS });
    for (const b of others) {
      chrome.contextMenus.create({
        id: `${ROOT_OTHER}:${b.id}`,
        parentId: ROOT_OTHER,
        title: b.name,
        contexts: CONTEXTS,
      });
    }
  }
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
  // Un aller-retour de plus, mais l'ordre reste cohérent avec celui du popup.
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

chrome.runtime.onInstalled.addListener(() => void buildMenus());
chrome.runtime.onStartup.addListener(() => void buildMenus());

/** Le popup pousse la liste des matrices à chaque chargement. */
chrome.runtime.onMessage.addListener((msg: { type?: string; boards?: CachedBoard[] }) => {
  if (msg?.type !== 'boards' || !Array.isArray(msg.boards)) return;
  void (async () => {
    await chrome.storage.local.set({ [BOARDS_KEY]: msg.boards });
    await buildMenus();
  })();
});

/**
 * Le clic sur une entrée de menu ouvre le formulaire (#78).
 *
 * ⚠️ `chrome.action.openPopup()` n'est sorti du canal dev qu'avec **Chrome 127**,
 * et il échoue aussi quand aucune fenêtre n'a le focus. Le repli est le
 * comportement d'avant : on écrit directement. C'est le point non négociable —
 * une capture perdue en silence serait pire que l'absence de formulaire.
 *
 * L'ordre compte : la capture en attente est déposée AVANT d'ouvrir le popup,
 * sinon celui-ci se monte et ne trouve rien. Et elle est nettoyée si l'ouverture
 * échoue, faute de quoi le formulaire s'afficherait à la prochaine ouverture
 * manuelle, pour une capture déjà écrite.
 */
async function demander(boardId: string | null, info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  const title = titleFrom(info, tab);
  const url = urlFrom(info, tab);
  // ⚠️ `null` est résolu ICI, pas dans le formulaire : l'entrée « Ajouter à
  // « X » » annonce un nom, et le formulaire doit montrer CE nom. Le laisser
  // à `null` faisait retomber la sélection sur la première matrice de la liste,
  // c'est-à-dire sur une destination que rien n'avait annoncée.
  const cible = boardId ?? (await getActiveBoard());

  await setPending({ title, url, boardId: cible, at: Date.now() });
  try {
    await chrome.action.openPopup();
  } catch {
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
