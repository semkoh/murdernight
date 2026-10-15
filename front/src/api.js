// Le front ne parle QU'AU BFF.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("session")) ?? null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  try {
    if (session) localStorage.setItem("session", JSON.stringify(session));
    else localStorage.removeItem("session");
  } catch {
    /* stockage indisponible */
  }
}

/** Prévient l'application quand la session expire. */
export const sessionEvents = new EventTarget();

export async function api(path, { method = "GET", body } = {}) {
  const session = getSession();
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Impossible de joindre le serveur. L'application est-elle lancée ?");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session) {
      setSession(null);
      sessionEvents.dispatchEvent(new Event("expired"));
    }
    throw new Error(Array.isArray(data.detail) ? traduireValidation(data.detail) : data.detail ?? "Erreur inattendue");
  }
  return data;
}

function traduireValidation(erreurs) {
  const e = erreurs[0] ?? {};
  const champ = e.loc?.at(-1);
  if (typeof e.msg === "string" && e.msg.startsWith("Value error, ")) return e.msg.slice(13);
  if (champ === "email") return "Adresse email invalide";
  if (champ === "password") return "Le mot de passe doit faire au moins 8 caractères";
  if (champ === "pseudo") return "Pseudo invalide (2 à 30 caractères, lettres et chiffres)";
  if (champ === "personnages") return "Il faut entre 3 et 12 personnages";
  if (champ === "nom") return "Chaque personnage doit avoir un nom (2 caractères minimum)";
  if (champ === "texte") return "Chaque indice doit faire au moins 3 caractères";
  if (champ === "scenario") return "Le scénario doit faire au moins 10 caractères";
  return "Certaines informations sont invalides";
}

export const STATUTS = {
  preparation: { label: "Préparation", emoji: "📝" },
  en_cours: { label: "Enquête en cours", emoji: "🔍" },
  vote: { label: "Vote", emoji: "🗳️" },
  terminee: { label: "Terminée", emoji: "🎭" },
};

export const lienInvitation = (code) => `${window.location.origin}/rejoindre/${code}`;
