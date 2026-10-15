import { STATUTS } from "../api.js";

const ORDRE = ["preparation", "en_cours", "vote", "terminee"];

/** Frise des 4 étapes d'une partie. */
export default function Stepper({ statut }) {
  const actuel = ORDRE.indexOf(statut);
  return (
    <ol className="stepper" aria-label="Avancement de la partie">
      {ORDRE.map((s, i) => (
        <li key={s} className={i < actuel ? "done" : i === actuel ? "current" : ""} aria-current={i === actuel ? "step" : undefined}>
          <span className="stepper-dot">{i < actuel ? "✓" : i + 1}</span>
          <span className="stepper-label">{STATUTS[s].label}</span>
        </li>
      ))}
    </ol>
  );
}
