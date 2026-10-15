import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";

/**
 * Charge une partie et la rafraîchit toutes les 3 secondes (seulement quand l'onglet est visible),
 * pour que chaque joueur voie les nouveaux indices et le vote en direct.
 */
export function usePartie(id, intervalle = 3000) {
  const [partie, setPartie] = useState(null);
  const [erreur, setErreur] = useState("");
  const enCours = useRef(false);

  const recharger = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      setPartie(await api(`/api/parties/${id}`));
      setErreur("");
    } catch (e) {
      setErreur(e.message);
    } finally {
      enCours.current = false;
    }
  }, [id]);

  useEffect(() => {
    recharger();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") recharger();
    }, intervalle);
    const auRetour = () => document.visibilityState === "visible" && recharger();
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [recharger, intervalle]);

  return { partie, setPartie, erreur, recharger };
}
