import { useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api.js";

export default function Connexion({ onLogin }) {
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", pseudo: "", password: "" });
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const inscription = mode === "register";
  const maj = (champ) => (e) => setForm({ ...form, [champ]: e.target.value });

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const s = inscription
        ? await api("/api/auth/register", { method: "POST", body: form })
        : await api("/api/auth/login", { method: "POST", body: { email: form.email, password: form.password } });
      onLogin(s, location.state?.retour);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="auth">
      <form onSubmit={envoyer} className="card dossier-form">
        <p className="stamp">Accès réservé</p>
        <h1>{inscription ? "Nouvel enquêteur" : "Identifiez-vous"}</h1>
        {location.state?.retour?.startsWith("/rejoindre") && (
          <p className="muted">Connectez-vous pour rejoindre la partie.</p>
        )}

        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" value={form.email} onChange={maj("email")} required />

        {inscription && (
          <>
            <label htmlFor="pseudo">Pseudo <span className="muted">(visible par les autres joueurs)</span></label>
            <input id="pseudo" value={form.pseudo} onChange={maj("pseudo")} required minLength={2} maxLength={30} />
          </>
        )}

        <label htmlFor="password">Mot de passe</label>
        <div className="password">
          <input
            id="password"
            type={voir ? "text" : "password"}
            autoComplete={inscription ? "new-password" : "current-password"}
            value={form.password}
            onChange={maj("password")}
            required
            minLength={inscription ? 8 : 1}
          />
          <button type="button" onClick={() => setVoir(!voir)} aria-label={voir ? "Masquer" : "Afficher"}>
            {voir ? "🙈" : "👁️"}
          </button>
        </div>

        {erreur && <p className="error">{erreur}</p>}
        <button className="btn big" disabled={envoi}>
          {envoi ? "…" : inscription ? "Créer mon compte" : "Entrer"}
        </button>
        <button type="button" className="link" onClick={() => { setMode(inscription ? "login" : "register"); setErreur(""); }}>
          {inscription ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? S'inscrire"}
        </button>
      </form>
    </section>
  );
}
