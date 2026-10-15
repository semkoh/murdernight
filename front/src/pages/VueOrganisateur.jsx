import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, lienInvitation } from "../api.js";
import Stepper from "../components/Stepper.jsx";
import Resultat from "../components/Resultat.jsx";
import { useToast } from "../components/Toast.jsx";

export default function VueOrganisateur({ partie, setPartie }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [brouillon, setBrouillon] = useState({}); // distribution manuelle en cours {joueur_id: personnage_id}
  const [occupe, setOccupe] = useState(false);
  const [persoOuvert, setPersoOuvert] = useState(null);
  const { statut, joueurs, personnages, indices } = partie;
  const preparation = statut === "preparation";

  // Le brouillon suit la distribution enregistrée tant qu'on ne la modifie pas
  useEffect(() => {
    setBrouillon(Object.fromEntries(joueurs.map((j) => [j.joueur_id, j.personnage_id ?? ""])));
  }, [joueurs.map((j) => `${j.joueur_id}:${j.personnage_id}`).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const action = async (chemin, { body, methode = "POST", message } = {}) => {
    setOccupe(true);
    try {
      const vue = await api(`/api/parties/${partie.id}${chemin}`, { method: methode, body });
      if (vue) setPartie(vue);
      if (message) toast(message);
      return true;
    } catch (e) {
      toast(e.message, "error");
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const copier = async (texte, message) => {
    try {
      await navigator.clipboard.writeText(texte);
      toast(message);
    } catch {
      toast(texte, "warn");
    }
  };

  const supprimer = async () => {
    if (!confirm("Supprimer définitivement cette enquête ?")) return;
    await api(`/api/parties/${partie.id}`, { method: "DELETE" }).catch((e) => toast(e.message, "error"));
    navigate("/mes-parties");
  };

  const distributionModifiee = joueurs.some((j) => String(brouillon[j.joueur_id] ?? "") !== String(j.personnage_id ?? ""));
  const coupable = personnages.find((p) => p.est_coupable);
  const pretADemarrer = joueurs.length >= 2 && joueurs.every((j) => j.personnage_id)
    && joueurs.some((j) => j.personnage_id === coupable.id) && !distributionModifiee;
  const prises = Object.values(brouillon).filter(Boolean).map(Number);
  const nbRevel = indices.filter((i) => i.debloque).length;

  return (
    <section className="partie">
      <div className="partie-head">
        <div>
          <p className="eyebrow">🎩 Vous êtes le maître du jeu</p>
          <h1>{partie.titre}</h1>
          <p className="muted">☠️ {partie.victime} · 📍 {partie.lieu}</p>
        </div>
        <div className="code-box">
          <span>Code de la partie</span>
          <strong>{partie.code}</strong>
          <button className="link" onClick={() => copier(lienInvitation(partie.code), "Lien d'invitation copié")}>🔗 Copier le lien d'invitation</button>
        </div>
      </div>

      <Stepper statut={statut} />

      {statut === "terminee" && partie.resultat && <Resultat resultat={partie.resultat} />}

      {/* ---------- Joueurs et distribution des rôles ---------- */}
      <div className="card">
        <div className="card-head">
          <h2>👥 Joueurs ({joueurs.length}/{personnages.length})</h2>
          {preparation && joueurs.length > 0 && (
            <button className="btn ghost small" disabled={occupe}
              onClick={() => action("/attribuer", { body: { mode: "aleatoire" }, message: "Rôles distribués au hasard 🎲" })}>
              🎲 Distribuer au hasard
            </button>
          )}
        </div>

        {joueurs.length === 0 ? (
          <p className="empty">En attente des joueurs… Donnez-leur le code <strong>{partie.code}</strong> ou le lien d'invitation.</p>
        ) : (
          <ul className="players">
            {joueurs.map((j) => {
              const perso = personnages.find((p) => p.id === j.personnage_id);
              return (
                <li key={j.joueur_id}>
                  <span className="avatar">{j.pseudo[0].toUpperCase()}</span>
                  <span className="player-name">{j.pseudo}</span>
                  {preparation ? (
                    <select value={brouillon[j.joueur_id] ?? ""} aria-label={`Personnage de ${j.pseudo}`}
                      onChange={(e) => setBrouillon({ ...brouillon, [j.joueur_id]: e.target.value ? Number(e.target.value) : "" })}>
                      <option value="">— Choisir un personnage —</option>
                      {personnages.map((p) => (
                        <option key={p.id} value={p.id} disabled={prises.includes(p.id) && brouillon[j.joueur_id] !== p.id}>
                          {p.nom}{p.est_coupable ? " 🔪" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={perso?.est_coupable ? "role coupable" : "role"}>{perso?.nom}{perso?.est_coupable && " 🔪"}</span>
                  )}
                  {statut === "vote" && <span className={`pill ${j.a_vote ? "pill-ok" : ""}`}>{j.a_vote ? "A voté" : "Réfléchit…"}</span>}
                  {preparation && (
                    <button className="icon-btn" aria-label={`Exclure ${j.pseudo}`}
                      onClick={() => confirm(`Exclure ${j.pseudo} ?`) && action(`/joueurs/${j.joueur_id}`, { methode: "DELETE", message: `${j.pseudo} a été exclu` })}>✕</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {preparation && joueurs.length > 0 && (
          <div className="row end">
            {distributionModifiee && (
              <button className="btn ghost" disabled={occupe}
                onClick={() => action("/attribuer", {
                  body: { mode: "manuel", attributions: Object.fromEntries(Object.entries(brouillon).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) },
                  message: "Distribution enregistrée",
                })}>
                💾 Enregistrer la distribution
              </button>
            )}
            <button className="btn big" disabled={occupe || !pretADemarrer}
              onClick={() => action("/demarrer", { message: "L'enquête commence ! Les joueurs découvrent leur rôle." })}>
              ▶️ Lancer l'enquête
            </button>
          </div>
        )}
        {preparation && !pretADemarrer && joueurs.length > 0 && (
          <p className="muted small hint">
            {joueurs.length < 2 ? "Il faut au moins 2 joueurs." :
              distributionModifiee ? "Enregistrez la distribution avant de lancer." :
              !joueurs.every((j) => j.personnage_id) ? "Donnez un personnage à chaque joueur." :
              "Le coupable doit être joué par quelqu'un."}
          </p>
        )}
      </div>

      {/* ---------- Pilotage de la soirée ---------- */}
      {statut === "en_cours" && (
        <div className="card control">
          <div>
            <h2>🔍 L'enquête est en cours</h2>
            <p className="muted">{nbRevel} indice{nbRevel > 1 ? "s" : ""} révélé{nbRevel > 1 ? "s" : ""} sur {indices.length}. Quand les joueurs sont prêts, ouvrez le vote.</p>
          </div>
          <button className="btn big" disabled={occupe}
            onClick={() => confirm("Ouvrir le vote ? Les joueurs vont devoir désigner le coupable.") && action("/vote/ouvrir", { message: "Le vote est ouvert 🗳️" })}>
            🗳️ Ouvrir le vote
          </button>
        </div>
      )}
      {statut === "vote" && (
        <div className="card control">
          <div>
            <h2>🗳️ Vote en cours : {partie.votes_recus}/{partie.nb_joueurs}</h2>
            <div className="track big"><div style={{ width: `${(partie.votes_recus / Math.max(partie.nb_joueurs, 1)) * 100}%` }} /></div>
            <p className="muted small">La vérité sera révélée automatiquement quand tout le monde aura voté.</p>
          </div>
          <button className="btn big danger" disabled={occupe}
            onClick={() => confirm("Révéler le coupable maintenant ?") && action("/terminer", { message: "La vérité est révélée" })}>
            🎭 Révéler maintenant
          </button>
        </div>
      )}

      {/* ---------- Indices ---------- */}
      <div className="card">
        <h2>🔎 Indices</h2>
        {preparation && <p className="muted small">Vous pourrez les révéler une fois l'enquête lancée.</p>}
        {indices.length === 0 && <p className="empty">Aucun indice prévu.</p>}
        <ol className="clues">
          {indices.map((i) => (
            <li key={i.id} className={i.debloque ? "revealed" : ""}>
              <span className="clue-num">{i.ordre}</span>
              <div className="clue-body">
                <p>{i.texte}</p>
                <span className="clue-meta">
                  {i.visibilite === "prive" ? `🔒 Seulement pour ${i.destinataire}` : "📢 Pour tout le monde"}
                  {i.visibilite === "prive" && !preparation && !joueurs.some((j) => j.personnage_id === i.destinataire_id) &&
                    " · ⚠️ personnage non joué : personne ne le recevra"}
                </span>
              </div>
              {i.debloque ? (
                <span className="pill pill-ok">Révélé</span>
              ) : (statut === "en_cours" || statut === "vote") ? (
                <button className="btn small" disabled={occupe}
                  onClick={() => action(`/indices/${i.id}/debloquer`, { message: `Indice ${i.ordre} révélé` })}>Révéler</button>
              ) : (
                <span className="pill">Caché</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* ---------- Fiches personnages ---------- */}
      <div className="card">
        <h2>🎭 Les personnages</h2>
        <div className="persos">
          {personnages.map((p) => (
            <div key={p.id} className={`perso-mini ${p.est_coupable ? "coupable" : ""}`}>
              <button className="perso-toggle" onClick={() => setPersoOuvert(persoOuvert === p.id ? null : p.id)} aria-expanded={persoOuvert === p.id}>
                <strong>{p.nom}</strong>{p.est_coupable && <span className="badge badge-coupable">🔪 Coupable</span>}
                <span className="muted">{persoOuvert === p.id ? "▾" : "▸"}</span>
              </button>
              {persoOuvert === p.id && (
                <div className="perso-mini-body">
                  <p>{p.description}</p>
                  <p><b>Alibi :</b> {p.alibi || "—"}</p>
                  <p><b>Secret :</b> {p.secret || "—"}</p>
                  <p><b>Objectif :</b> {p.objectif || "—"}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="row end">
        {preparation && <Link to={`/partie/${partie.id}/modifier`} className="btn ghost">✏️ Modifier le scénario</Link>}
        <button className="btn ghost danger-text" onClick={supprimer}>🗑️ Supprimer l'enquête</button>
      </div>
    </section>
  );
}
