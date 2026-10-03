import { useEffect } from 'react';

/** Titre de l'onglet : « Penduline - <page> », le nom seul tant que la page n'est pas connue (ou sur la connexion). */
export function useDocumentTitle(page: string | null | undefined): void {
  useEffect(() => {
    document.title = page ? `Penduline - ${page}` : 'Penduline';
  }, [page]);
}
