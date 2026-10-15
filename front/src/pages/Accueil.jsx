import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Accueil({ user }) {
  const [code, setCode] = useState("");
  const navigate = useNavigate();

  const rejoindre = (e) => {
    e.preventDefault();
    const propre = code.trim().toUpperCase();
    if (propre.length === 6) navigate(`/rejoindre/${propre}`);
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Un meurtre. Des suspects. Un seul coupable.</p>
        <h1>
          Le coupable est <span className="blood">parmi vous</span>.
        </h1>
        <p className="lead">
          Organisez une Murder Party depuis votre téléphone : chaque invité reçoit son rôle secret,
          les indices tombent au fil de la soirée, et tout le monde vote à la fin.
        </p>

        <div className="hero-actions">
          <form className="join" onSubmit={rejoindre}>
            <label htmlFor="code">Vous avez un code ?</label>
            <div className="join-row">
              <input
                id="code"
                className="code-input"
                value={code}
                maxLength={6}
                placeholder="K7X2PQ"
                autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <button className="btn" disabled={code.length !== 6}>Rejoindre</button>
            </div>
          </form>
          <div className="or">ou</div>
          <Link to={user ? "/creer" : "/connexion"} state={{ retour: "/creer" }} className="btn ghost big">
            🖋️ Créer une enquête
          </Link>
        </div>
      </section>

      <section className="how">
        <div className="how-step">
          <span>I</span>
          <h3>L'organisateur écrit l'enquête</h3>
          <p>Victime, lieu, suspects, coupable et indices. Ou un scénario prêt à jouer en un clic.</p>
        </div>
        <div className="how-step">
          <span>II</span>
          <h3>Chacun reçoit son dossier secret</h3>
          <p>Identité, alibi, secret et objectif. Le coupable sait qu'il est coupable… les autres non.</p>
        </div>
        <div className="how-step">
          <span>III</span>
          <h3>Les indices tombent</h3>
          <p>L'organisateur les révèle quand il veut. Certains ne sont envoyés qu'à un seul joueur.</p>
        </div>
        <div className="how-step">
          <span>IV</span>
          <h3>Le vote, puis la vérité</h3>
          <p>Chacun accuse un suspect. Le coupable est révélé : s'en sortira-t-il ?</p>
        </div>
      </section>
    </>
  );
}
