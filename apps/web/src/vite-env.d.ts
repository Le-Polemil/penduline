/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * ID de l'extension à qui pousser la session (`lib/extension-bridge.ts`).
   * Optionnelle : sans elle, le partage est inactif — l'ID d'une extension
   * chargée localement dépend du chemin du dossier, il n'y a donc pas de valeur
   * par défaut qui aurait du sens.
   */
  readonly VITE_EXTENSION_ID?: string;
  /**
   * URL publique du serveur MCP (#23), vers laquelle l'écran de consentement
   * poste la décision. Optionnelle : sans elle, l'écran le dit franchement
   * plutôt que d'échouer en silence — une installation sans serveur MCP reste
   * parfaitement utilisable.
   */
  readonly VITE_MCP_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
