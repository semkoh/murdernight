import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getSession, setSession, sessionEvents } from "./api.js";
import { useToast } from "./components/Toast.jsx";
import Accueil from "./pages/Accueil.jsx";
import Connexion from "./pages/Connexion.jsx";
import MesParties from "./pages/MesParties.jsx";
import Creer from "./pages/Creer.jsx";
import Partie from "./pages/Partie.jsx";
import Rejoindre from "./pages/Rejoindre.jsx";

function Protege({ user, children }) {
  const location = useLocation();
  if (!user) return <Navigate to="/connexion" replace state={{ retour: location.pathname }} />;
  return children;
}

export default function App() {
  const [session, setSessionState] = useState(getSession());
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const user = session?.user;

  useEffect(() => setMenu(false), [location.pathname]);

  useEffect(() => {
    const expire = () => {
      setSessionState(null);
      toast("Votre session a expiré, reconnectez-vous", "warn");
    };
    sessionEvents.addEventListener("expired", expire);
    return () => sessionEvents.removeEventListener("expired", expire);
  }, [toast]);

  const onLogin = (s, retour) => {
    setSession(s);
    setSessionState(s);
    toast(`Bienvenue, ${s.user.pseudo}`);
    navigate(retour ?? "/mes-parties", { replace: true });
  };

  const logout = () => {
    setSession(null);
    setSessionState(null);
    navigate("/");
  };

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo">
          <span aria-hidden="true">🔪</span> Murder<em>Night</em>
        </Link>
        <button className="burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>☰</button>
        <nav className={menu ? "open" : ""}>
          {user ? (
            <>
              <NavLink to="/mes-parties">Mes parties</NavLink>
              <NavLink to="/creer">Créer une enquête</NavLink>
              <span className="nav-user">🕵️ {user.pseudo}</span>
              <button className="nav-btn" onClick={logout}>Déconnexion</button>
            </>
          ) : (
            <NavLink to="/connexion" className="nav-btn">Connexion</NavLink>
          )}
        </nav>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<Accueil user={user} />} />
          <Route path="/connexion" element={user ? <Navigate to="/mes-parties" replace /> : <Connexion onLogin={onLogin} />} />
          <Route path="/rejoindre/:code" element={<Protege user={user}><Rejoindre /></Protege>} />
          <Route path="/mes-parties" element={<Protege user={user}><MesParties /></Protege>} />
          <Route path="/creer" element={<Protege user={user}><Creer /></Protege>} />
          <Route path="/partie/:id/modifier" element={<Protege user={user}><Creer /></Protege>} />
          <Route path="/partie/:id" element={<Protege user={user}><Partie user={user} /></Protege>} />
          <Route
            path="*"
            element={
              <section className="center-page">
                <h1>Pièce introuvable</h1>
                <p className="muted">Cette porte du manoir ne mène nulle part.</p>
                <Link to="/" className="btn">Retour au hall</Link>
              </section>
            }
          />
        </Routes>
      </main>

      <footer className="footer">MurderNight · Jeu de rôle entre amis · Aucun personnage n'a été blessé</footer>
    </div>
  );
}
