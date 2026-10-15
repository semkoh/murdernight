/** Écran de révélation, commun à l'organisateur et aux joueurs. */
export default function Resultat({ resultat, monPseudo }) {
  const { coupable, joue_par, coupable_demasque, votes, gagnants } = resultat;
  const total = votes.reduce((s, v) => s + v.voix, 0) || 1;
  const gagne = monPseudo && gagnants.includes(monPseudo);
  const etaitCoupable = monPseudo && monPseudo === joue_par;

  return (
    <section className="reveal">
      <p className="eyebrow">La vérité éclate</p>
      <h2 className="reveal-title">
        Le coupable était <span className="blood">{coupable.nom}</span>
      </h2>
      <p className="reveal-sub">incarné par <strong>{joue_par}</strong></p>

      <p className={`verdict ${coupable_demasque ? "verdict-ok" : "verdict-ko"}`}>
        {coupable_demasque ? "⚖️ Démasqué ! La justice est rendue." : "🌫️ Le coupable s'en tire… cette fois."}
      </p>

      {monPseudo && (
        <p className="perso-verdict">
          {etaitCoupable
            ? coupable_demasque ? "Vous avez été démasqué. Bien joué quand même !" : "Vous avez berné tout le monde. Crime parfait. 🥀"
            : gagne ? "🏆 Vous aviez vu juste !" : "Vous vous êtes trompé de suspect…"}
        </p>
      )}

      <div className="card">
        <h3>Les accusations</h3>
        {votes.length === 0 && <p className="muted">Personne n'a voté.</p>}
        {[...votes].sort((a, b) => b.voix - a.voix).map((v) => (
          <div key={v.personnage_id} className={`vote-bar ${v.personnage_id === coupable.id ? "is-coupable" : ""}`}>
            <span>{v.nom}{v.personnage_id === coupable.id && " 🔪"}</span>
            <div className="track"><div style={{ width: `${(v.voix / total) * 100}%` }} /></div>
            <strong>{v.voix}</strong>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>🏆 Ont trouvé le coupable</h3>
          {gagnants.length ? <p>{gagnants.join(", ")}</p> : <p className="muted">Personne…</p>}
        </div>
        <div className="card dossier">
          <h3>Le dossier du coupable</h3>
          <p><b>Secret :</b> {coupable.secret || "—"}</p>
          <p><b>Alibi :</b> {coupable.alibi || "—"}</p>
        </div>
      </div>
    </section>
  );
}
