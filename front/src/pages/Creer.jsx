import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { INDICE_VIDE, PERSONNAGE_VIDE, SCENARIO_EXEMPLE } from "../scenarioExemple.js";

const VIDE = {
  titre: "", victime: "", lieu: "", scenario: "",
  personnages: [{ ...PERSONNAGE_VIDE, est_coupable: true }, { ...PERSONNAGE_VIDE }, { ...PERSONNAGE_VIDE }],
  indices: [{ ...INDICE_VIDE }],
};

/** Transforme une partie reçue de l'API en données de formulaire (pour la modification). */
function versFormulaire(p) {
  const position = Object.fromEntries(p.personnages.map((perso, i) => [perso.id, i]));
  return {
    titre: p.titre, victime: p.victime, lieu: p.lieu, scenario: p.scenario,
    personnages: p.personnages.map(({ nom, description, alibi, secret, objectif, est_coupable }) =>
      ({ nom, description, alibi, secret, objectif, est_coupable })),
    indices: p.indices.map((i) => ({
      texte: i.texte, visibilite: i.visibilite,
      destinataire: i.destinataire_id != null ? position[i.destinataire_id] : null,
    })),
  };
}

export default function Creer() {
  const { id } = useParams();
  const modification = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(VIDE);
  const [ouvert, setOuvert] = useState(0); // personnage déplié
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!modification) return;
    api(`/api/parties/${id}`)
      .then((p) => {
        if (p.vue !== "organisateur" || p.statut !== "preparation") return navigate(`/partie/${id}`, { replace: true });
        setForm(versFormulaire(p));
      })
      .catch((e) => setErreur(e.message));
  }, [id, modification, navigate]);

  const champ = (nom) => (e) => setForm({ ...form, [nom]: e.target.value });

  // ---- Personnages ----
  const majPerso = (i, nom, valeur) =>
    setForm({ ...form, personnages: form.personnages.map((p, n) => (n === i ? { ...p, [nom]: valeur } : p)) });
  const choisirCoupable = (i) =>
    setForm({ ...form, personnages: form.personnages.map((p, n) => ({ ...p, est_coupable: n === i })) });
  const ajouterPerso = () => {
    setForm({ ...form, personnages: [...form.personnages, { ...PERSONNAGE_VIDE }] });
    setOuvert(form.personnages.length);
  };
  const retirerPerso = (i) => {
    const personnages = form.personnages.filter((_, n) => n !== i);
    if (!personnages.some((p) => p.est_coupable) && personnages.length) personnages[0] = { ...personnages[0], est_coupable: true };
    // Les indices privés qui visaient ce personnage redeviennent publics
    const indices = form.indices.map((ind) => {
      if (ind.destinataire === i) return { ...ind, visibilite: "public", destinataire: null };
      if (ind.destinataire > i) return { ...ind, destinataire: ind.destinataire - 1 };
      return ind;
    });
    setForm({ ...form, personnages, indices });
  };

  // ---- Indices ----
  const majIndice = (i, modif) =>
    setForm({ ...form, indices: form.indices.map((ind, n) => (n === i ? { ...ind, ...modif } : ind)) });
  const deplacerIndice = (i, sens) => {
    const j = i + sens;
    if (j < 0 || j >= form.indices.length) return;
    const indices = [...form.indices];
    [indices[i], indices[j]] = [indices[j], indices[i]];
    setForm({ ...form, indices });
  };

  const chargerExemple = () => {
    setForm(structuredClone(SCENARIO_EXEMPLE));
    setOuvert(0);
    toast("Scénario « Manoir Blackwood » chargé");
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    const corps = { ...form, indices: form.indices.filter((i) => i.texte.trim()) };
    try {
      const p = modification
        ? await api(`/api/parties/${id}`, { method: "PUT", body: corps })
        : await api("/api/parties", { method: "POST", body: corps });
      toast(modification ? "Enquête mise à jour" : `Enquête créée : code ${p.code}`);
      navigate(`/partie/${p.id}`);
    } catch (err) {
      setErreur(err.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setEnvoi(false);
    }
  };

  const nomsPersos = form.personnages.map((p, i) => p.nom.trim() || `Personnage ${i + 1}`);

  return (
    <form onSubmit={enregistrer} className="creer">
      <div className="page-head">
        <div>
          <p className="eyebrow">{modification ? "Modifier l'enquête" : "Nouvelle enquête"}</p>
          <h1>Le scénario</h1>
        </div>
        {!modification && (
          <button type="button" className="btn ghost" onClick={chargerExemple}>🎲 Charger un scénario prêt à jouer</button>
        )}
      </div>
      {modification && <p className="notice">⚠️ Modifier le scénario remet à zéro la distribution des rôles.</p>}
      {erreur && <p className="error">{erreur}</p>}

      {/* ---- Le crime ---- */}
      <fieldset className="card">
        <legend>🩸 Le crime</legend>
        <label htmlFor="titre">Titre de l'enquête</label>
        <input id="titre" value={form.titre} onChange={champ("titre")} placeholder="Meurtre au manoir Blackwood" required minLength={3} maxLength={120} />
        <div className="grid-2">
          <div>
            <label htmlFor="victime">Victime</label>
            <input id="victime" value={form.victime} onChange={champ("victime")} placeholder="Lord Blackwood" required minLength={2} maxLength={80} />
          </div>
          <div>
            <label htmlFor="lieu">Lieu</label>
            <input id="lieu" value={form.lieu} onChange={champ("lieu")} placeholder="Le manoir, un soir d'orage" required minLength={2} maxLength={120} />
          </div>
        </div>
        <label htmlFor="scenario">Ce que tout le monde sait au début</label>
        <textarea id="scenario" rows={4} value={form.scenario} onChange={champ("scenario")} required minLength={10} maxLength={4000}
          placeholder="Ce soir, pendant le dîner, la victime s'est effondrée…" />
      </fieldset>

      {/* ---- Personnages ---- */}
      <fieldset className="card">
        <legend>🎭 Les suspects ({form.personnages.length})</legend>
        <p className="muted small">Entre 3 et 12 personnages. La description est publique, le reste n'est vu que par le joueur qui l'incarne.</p>
        {form.personnages.map((p, i) => (
          <div key={i} className={`perso-edit ${p.est_coupable ? "coupable" : ""}`}>
            <div className="perso-edit-head">
              <button type="button" className="perso-toggle" onClick={() => setOuvert(ouvert === i ? -1 : i)} aria-expanded={ouvert === i}>
                <span>{ouvert === i ? "▾" : "▸"}</span> {nomsPersos[i]}
                {p.est_coupable && <span className="badge badge-coupable">🔪 Coupable</span>}
              </button>
              <label className="radio">
                <input type="radio" name="coupable" checked={p.est_coupable} onChange={() => choisirCoupable(i)} /> C'est le coupable
              </label>
              {form.personnages.length > 3 && (
                <button type="button" className="icon-btn" aria-label={`Retirer ${nomsPersos[i]}`} onClick={() => retirerPerso(i)}>✕</button>
              )}
            </div>
            {ouvert === i && (
              <div className="perso-edit-body">
                <label>Nom</label>
                <input value={p.nom} onChange={(e) => majPerso(i, "nom", e.target.value)} required minLength={2} maxLength={80} />
                <label>Description publique</label>
                <textarea rows={2} value={p.description} onChange={(e) => majPerso(i, "description", e.target.value)} maxLength={1000} />
                <div className="grid-3">
                  <div><label>🕰️ Alibi</label><textarea rows={3} value={p.alibi} onChange={(e) => majPerso(i, "alibi", e.target.value)} maxLength={1000} /></div>
                  <div><label>🤫 Secret</label><textarea rows={3} value={p.secret} onChange={(e) => majPerso(i, "secret", e.target.value)} maxLength={1000} /></div>
                  <div><label>🎯 Objectif</label><textarea rows={3} value={p.objectif} onChange={(e) => majPerso(i, "objectif", e.target.value)} maxLength={1000} /></div>
                </div>
              </div>
            )}
          </div>
        ))}
        {form.personnages.length < 12 && (
          <button type="button" className="btn ghost" onClick={ajouterPerso}>+ Ajouter un suspect</button>
        )}
      </fieldset>

      {/* ---- Indices ---- */}
      <fieldset className="card">
        <legend>🔎 Les indices ({form.indices.filter((i) => i.texte.trim()).length})</legend>
        <p className="muted small">Vous les révélerez un par un pendant la soirée. Un indice privé n'est envoyé qu'à un seul personnage.</p>
        {form.indices.map((ind, i) => (
          <div key={i} className="indice-edit">
            <span className="indice-num">{i + 1}</span>
            <textarea rows={2} value={ind.texte} onChange={(e) => majIndice(i, { texte: e.target.value })} placeholder="Une tasse brisée a été retrouvée…" maxLength={1000} />
            <div className="indice-opts">
              <select value={ind.visibilite === "public" ? "public" : String(ind.destinataire)}
                onChange={(e) => majIndice(i, e.target.value === "public" ? { visibilite: "public", destinataire: null } : { visibilite: "prive", destinataire: Number(e.target.value) })}
                aria-label="Qui reçoit cet indice">
                <option value="public">📢 Pour tout le monde</option>
                {nomsPersos.map((nom, n) => <option key={n} value={n}>🔒 Seulement {nom}</option>)}
              </select>
              <div className="row">
                <button type="button" className="icon-btn" onClick={() => deplacerIndice(i, -1)} aria-label="Monter">↑</button>
                <button type="button" className="icon-btn" onClick={() => deplacerIndice(i, 1)} aria-label="Descendre">↓</button>
                <button type="button" className="icon-btn" onClick={() => setForm({ ...form, indices: form.indices.filter((_, n) => n !== i) })} aria-label="Supprimer">✕</button>
              </div>
            </div>
          </div>
        ))}
        {form.indices.length < 30 && (
          <button type="button" className="btn ghost" onClick={() => setForm({ ...form, indices: [...form.indices, { ...INDICE_VIDE }] })}>+ Ajouter un indice</button>
        )}
      </fieldset>

      <div className="sticky-actions">
        <button type="button" className="btn ghost" onClick={() => navigate(-1)}>Annuler</button>
        <button className="btn big" disabled={envoi}>{envoi ? "…" : modification ? "Enregistrer" : "Créer l'enquête"}</button>
      </div>
    </form>
  );
}
