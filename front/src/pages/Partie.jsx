import { Link, useParams } from "react-router-dom";
import { usePartie } from "../components/usePartie.js";
import VueOrganisateur from "./VueOrganisateur.jsx";
import VueJoueur from "./VueJoueur.jsx";

/** Charge la partie : l'API renvoie la vue organisateur OU joueur selon qui est connecté. */
export default function Partie({ user }) {
  const { id } = useParams();
  const { partie, setPartie, erreur, recharger } = usePartie(id);

  if (erreur && !partie) {
    return (
      <section className="center-page">
        <h1>Accès refusé</h1>
        <p className="error">{erreur}</p>
        <Link to="/mes-parties" className="btn">Mes parties</Link>
      </section>
    );
  }
  if (!partie) return <p className="muted center-page">Ouverture du dossier…</p>;

  return partie.vue === "organisateur"
    ? <VueOrganisateur partie={partie} setPartie={setPartie} recharger={recharger} />
    : <VueJoueur partie={partie} setPartie={setPartie} recharger={recharger} user={user} />;
}
