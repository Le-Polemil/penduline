/**
 * Adaptateur de stockage pour que supabase-js persiste la session dans
 * chrome.storage.local (disponible dans le panneau ET le service worker MV3, où
 * localStorage n'existe pas). Repli sur localStorage quand les API chrome ne
 * sont pas là (aperçu dans un onglet normal, tests).
 */
const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;

export const chromeStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!hasChromeStorage) return globalThis.localStorage?.getItem(key) ?? null;
    const res = await chrome.storage.local.get(key);
    return (res[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!hasChromeStorage) return void globalThis.localStorage?.setItem(key, value);
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    if (!hasChromeStorage) return void globalThis.localStorage?.removeItem(key);
    await chrome.storage.local.remove(key);
  },
};
