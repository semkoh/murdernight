import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, STATUTS } from "../api.js";

function Carte({ p, role }) {
  return (
    <Link to={`/partie/${p.id}`} className={`case-card statut-${p.statut}`}>
      <div className="case-top">
        <span className="case-code">#{p.code}</span>
        <span className={`badge badge-${p.statut}`}>{STATUTS[p.statut].emoji} {STATUTS[p.statut].label}</span>
      </div>
      <h3>{p.titre}</h3>
      <p className="muted">{p.lieu}</p>
      <p className="case-meta">
        {role === "orga" ? "🎩 Vous organisez" : `🎩 Organisée par ${p.organisateur}`} · 👥 {p.nb_joueurs} joueur{p.nb_joueurs > 1 ? "s" : ""}
      </p>
    </Link>
  );
}

export default function MesParties() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api("/api/parties/mes").then(setData).catch((e) => setErreur(e.message));
  }, []);

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="eyebrow">Vos dossiers</p>
          <h1>Mes parties</h1>
        </div>
        <Link to="/creer" className="btn">🖋️ Nouvelle enquête</Link>
      </div>

      {erreur && <p className="error">{erreur}</p>}
      {!data && !erreur && <p className="muted">Ouverture des archives…</p>}

      {data && (
        <>
          <h2 className="section-title">Organisées par moi</h2>
          {data.organisees.length === 0 ? (
            <div className="empty">Aucune enquête. <Link to="/creer">Créez la première</Link>, ou chargez le scénario d'exemple.</div>
          ) : (
            <div className="cases">{data.organisees.map((p) => <Carte key={p.id} p={p} role="orga" />)}</div>
          )}

          <h2 className="section-title">Où je joue</h2>
          {data.rejointes.length === 0 ? (
            <div className="empty">Vous n'avez rejoint aucune partie. Demandez son code à l'organisateur.</div>
          ) : (
            <div className="cases">{data.rejointes.map((p) => <Carte key={p.id} p={p} />)}</div>
          )}
        </>
      )}
    </section>
  );
}
