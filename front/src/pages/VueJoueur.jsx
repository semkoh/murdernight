import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import Stepper from "../components/Stepper.jsx";
import Resultat from "../components/Resultat.jsx";
import { useToast } from "../components/Toast.jsx";

export default function VueJoueur({ partie, setPartie, user }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [dossierVisible, setDossierVisible] = useState(false);
  const [choix, setChoix] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [nouveaux, setNouveaux] = useState(new Set());
  const vus = useRef(null);
  const statutPrecedent = useRef(partie.statut);
  const { statut, mon_personnage: moi, personnages, joueurs, indices } = partie;

  // Prévenir le joueur quand un indice arrive ou quand la partie change d'étape
  useEffect(() => {
    const ids = indices.map((i) => i.id);
    if (vus.current === null) {
      vus.current = new Set(ids);
    } else {
      const arrives = indices.filter((i) => !vus.current.has(i.id));
      if (arrives.length) {
        arrives.forEach((i) => vus.current.add(i.id));
        setNouveaux((n) => new Set([...n, ...arrives.map((i) => i.id)]));
        toast(arrives.some((i) => i.visibilite === "prive") ? "🔒 Un indice secret vient de vous parvenir !" : "🔎 Nouvel indice révélé !");
        navigator.vibrate?.(200);
      }
    }
    if (statutPrecedent.current !== statut) {
      if (statut === "en_cours") toast("L'enquête commence ! Découvrez votre dossier.");
      if (statut === "vote") toast("🗳️ Le vote est ouvert : qui est le coupable ?");
      if (statut === "terminee") toast("🎭 La vérité va être révélée…");
      statutPrecedent.current = statut;
    }
  }, [indices, statut, toast]);

  const voter = async () => {
    if (!choix) return;
    const nom = personnages.find((p) => p.id === choix)?.nom;
    if (!confirm(`Accuser ${nom} ? Votre vote est définitif.`)) return;
    setOccupe(true);
    try {
      setPartie(await api(`/api/parties/${partie.id}/votes`, { method: "POST", body: { personnage_id: choix } }));
      toast("Vote enregistré");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setOccupe(false);
    }
  };

  const quitter = async () => {
    if (!confirm("Quitter cette partie ?")) return;
    try {
      await api(`/api/parties/${partie.id}/quitter`, { method: "POST" });
      navigate("/mes-parties");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const joueurDe = (nomPerso) => joueurs.find((j) => j.personnage === nomPerso);

  return (
    <section className="partie">
      <div className="partie-head">
        <div>
          <p className="eyebrow">🎩 Organisée par {partie.organisateur}</p>
          <h1>{partie.titre}</h1>
          <p className="muted">☠️ {partie.victime} · 📍 {partie.lieu}</p>
        </div>
      </div>

      <Stepper statut={statut} />

      {statut === "terminee" && partie.resultat && <Resultat resultat={partie.resultat} monPseudo={user.pseudo} />}

      {/* ---------- Salle d'attente ---------- */}
      {statut === "preparation" && (
        <div className="card waiting">
          <div className="pulse" aria-hidden="true">🕯️</div>
          <h2>Les invités arrivent au manoir…</h2>
          <p className="muted">L'organisateur va bientôt distribuer les rôles. Votre dossier secret apparaîtra ici.</p>
          <ul className="guests">
            {joueurs.map((j) => <li key={j.pseudo} className={j.moi ? "me" : ""}>{j.pseudo}{j.moi && " (vous)"}</li>)}
          </ul>
          <button className="link" onClick={quitter}>Quitter la partie</button>
        </div>
      )}

      <div className="card scenario">
        <h2>📜 Le drame</h2>
        <p>{partie.scenario}</p>
      </div>

      {/* ---------- Mon dossier secret ---------- */}
      {moi && statut !== "terminee" && (
        <div className={`dossier ${moi.est_coupable ? "dossier-coupable" : ""}`}>
          <div className="dossier-head">
            <span className="stamp">Confidentiel</span>
            <button className="btn ghost small" onClick={() => setDossierVisible(!dossierVisible)}>
              {dossierVisible ? "🙈 Cacher" : "👁️ Ouvrir mon dossier"}
            </button>
          </div>
          <p className="dossier-label">Vous incarnez</p>
          <h2 className="dossier-name">{moi.nom}</h2>
          <p>{moi.description}</p>
          {dossierVisible ? (
            <div className="dossier-secret">
              {moi.est_coupable && <p className="coupable-alert">🔪 C'est vous le coupable. Ne vous faites pas démasquer.</p>}
              <p><b>🕰️ Votre alibi :</b> {moi.alibi || "—"}</p>
              <p><b>🤫 Votre secret :</b> {moi.secret || "—"}</p>
              <p><b>🎯 Votre objectif :</b> {moi.objectif || "—"}</p>
            </div>
          ) : (
            <p className="muted small">Vérifiez que personne ne regarde votre écran avant d'ouvrir votre dossier.</p>
          )}
        </div>
      )}

      {/* ---------- Vote ---------- */}
      {statut === "vote" && (
        <div className="card vote">
          {partie.mon_vote ? (
            <>
              <h2>✅ Vote enregistré</h2>
              <p>Vous accusez <strong>{personnages.find((p) => p.id === partie.mon_vote)?.nom}</strong>.</p>
              <p className="muted">{partie.votes_recus}/{partie.nb_joueurs} joueurs ont voté. Patience…</p>
              <div className="track big"><div style={{ width: `${(partie.votes_recus / Math.max(partie.nb_joueurs, 1)) * 100}%` }} /></div>
            </>
          ) : (
            <>
              <h2>🗳️ Qui est le coupable ?</h2>
              <div className="suspects">
                {personnages.filter((p) => p.id !== moi?.id).map((p) => (
                  <button key={p.id} className={`suspect ${choix === p.id ? "selected" : ""}`} onClick={() => setChoix(p.id)} aria-pressed={choix === p.id}>
                    <strong>{p.nom}</strong>
                    <span className="muted small">joué par {joueurDe(p.nom)?.pseudo}</span>
                  </button>
                ))}
              </div>
              <button className="btn big danger" disabled={!choix || occupe} onClick={voter}>☝️ J'accuse !</button>
            </>
          )}
        </div>
      )}

      {/* ---------- Indices ---------- */}
      {statut !== "preparation" && (
        <div className="card">
          <h2>🔎 Indices ({indices.length})</h2>
          {indices.length === 0 ? (
            <p className="empty">Aucun indice pour l'instant. Discutez, interrogez, observez…</p>
          ) : (
            <ol className="clues">
              {[...indices].reverse().map((i) => (
                <li key={i.id} className={`revealed ${nouveaux.has(i.id) ? "fresh" : ""} ${i.visibilite === "prive" ? "private" : ""}`}>
                  <span className="clue-num">{i.ordre}</span>
                  <div className="clue-body">
                    <p>{i.texte}</p>
                    <span className="clue-meta">{i.visibilite === "prive" ? "🔒 Rien que pour vous" : "📢 Tout le monde le sait"}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* ---------- Les suspects ---------- */}
      {statut !== "preparation" && (
        <div className="card">
          <h2>🎭 Les suspects</h2>
          <div className="persos">
            {personnages.map((p) => (
              <div key={p.id} className={`perso-mini ${p.id === moi?.id ? "me" : ""}`}>
                <div className="perso-mini-body">
                  <strong>{p.nom}</strong> <span className="muted small">· {joueurDe(p.nom)?.pseudo}{p.id === moi?.id && " (vous)"}</span>
                  <p>{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
