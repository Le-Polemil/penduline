import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Les applications MCP autorisées, et le moyen de leur retirer l'accès (#23).
 *
 * Hook autonome, sur le modèle de `useBinCount` et `useStats` : ces lignes ne
 * sont ni chargées au démarrage, ni écoutées en temps réel, ni touchées par
 * l'annulation. Les faire entrer dans `useStore` chargerait tout le monde pour
 * une modale qu'on ouvre trois fois par an.
 *
 * ⚠️ Il tape PostgREST directement, sans passer par le serveur MCP, et c'est
 * délibéré : un serveur en panne ne doit pas empêcher de lui couper l'accès.
 * C'est ce que la policy `"oauth_grants: owner"` rend possible.
 */

export interface Autorisation {
  id: string;
  client_name: string;
  created_at: string;
  last_used_at: string | null;
}

const COLS = 'id, client_name, created_at, last_used_at';

export function useAutorisations() {
  const [liste, setListe] = useState<Autorisation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('oauth_grants')
      .select(COLS)
      // `revoked_at` non nul = révoquée. On ne les affiche pas, mais on ne les
      // efface pas non plus : la trace qu'un accès a existé reste en base.
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      setErreur('La liste des applications connectées n’a pas pu être chargée.');
      return;
    }
    setErreur(null);
    setListe((data ?? []) as Autorisation[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const revoquer = useCallback(
    async (id: string) => {
      // Optimiste : la ligne disparaît tout de suite, et un échec la ramène en
      // même temps que le message. Attendre le serveur ferait paraître le clic
      // sans effet sur une liaison lente.
      const avant = liste;
      setListe((l) => l?.filter((a) => a.id !== id) ?? l);

      const { error } = await supabase
        .from('oauth_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        setListe(avant);
        setErreur('La révocation a échoué. Réessayez.');
      }
    },
    [liste],
  );

  return { liste, erreur, revoquer, recharger: charger };
}
