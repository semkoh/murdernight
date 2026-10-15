import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

/** Lien d'invitation : /rejoindre/K7X2PQ */
export default function Rejoindre() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api("/api/parties/rejoindre", { method: "POST", body: { code } })
      .then(({ id }) => navigate(`/partie/${id}`, { replace: true }))
      .catch((e) => setErreur(e.message));
  }, [code, navigate]);

  return (
    <section className="center-page">
      {erreur ? (
        <>
          <h1>Impossible d'entrer</h1>
          <p className="error">{erreur}</p>
          <Link to="/" className="btn">Essayer un autre code</Link>
        </>
      ) : (
        <p className="muted">On frappe à la porte du manoir…</p>
      )}
    </section>
  );
}
