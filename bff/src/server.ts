/**
 * BFF (Backend For Frontend) - MurderNight
 * Point d'entrée UNIQUE du front. Il :
 *  - vérifie le token de l'utilisateur auprès de l'API Auth
 *  - transmet l'identité (id + pseudo) à l'API Métier avec la clé interne
 *  - n'autorise que les routes prévues (liste blanche)
 *  - protège l'application (limitation de débit, en-têtes de sécurité, journalisation)
 */
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

const PORT = Number(process.env.PORT ?? 3000);
const AUTH_URL = process.env.AUTH_URL ?? "http://localhost:8001";
const METIER_URL = process.env.METIER_URL ?? "http://localhost:8002";
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? "cle-interne-dev";
const FRONT_ORIGIN = process.env.FRONT_ORIGIN ?? "http://localhost:5173";

type User = { id: number; email: string; pseudo: string };
type AuthedRequest = Request & { user?: User };

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: FRONT_ORIGIN.split(",") }));
app.use(express.json({ limit: "64kb" }));

// ---------- En-têtes de sécurité ----------
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// ---------- Journalisation (sans les appels de rafraîchissement, trop nombreux) ----------
app.use((req, res, next) => {
  const debut = Date.now();
  res.on("finish", () => {
    if (req.method === "GET" && res.statusCode === 200) return;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - debut} ms)`);
  });
  next();
});

// ---------- Limitation de débit ----------
function rateLimit(max: number, fenetreMs: number) {
  const compteurs = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const cle = `${req.ip}:${req.path}`;
    const now = Date.now();
    const c = compteurs.get(cle);
    if (!c || c.reset < now) {
      compteurs.set(cle, { n: 1, reset: now + fenetreMs });
      return next();
    }
    if (++c.n > max) {
      res.setHeader("Retry-After", Math.ceil((c.reset - now) / 1000));
      return res.status(429).json({ detail: "Trop de tentatives, réessayez dans une minute" });
    }
    next();
  };
}
const limiteAuth = rateLimit(10, 60_000);      // anti force brute
const limiteJeu = rateLimit(240, 60_000);      // le front rafraîchit la partie toutes les 3 s

/** Appelle un microservice et renvoie sa réponse telle quelle au front. */
async function callService(
  res: Response,
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  try {
    const r = await fetch(baseUrl + path, {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json", "X-Internal-Key": INTERNAL_KEY, ...options.headers },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 204) return res.status(204).end();
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch {
    res.status(503).json({ detail: "Service momentanément indisponible" });
  }
}

/** Middleware : vérifie le token auprès de l'API Auth. */
async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) return res.status(401).json({ detail: "Connexion requise" });
  try {
    const r = await fetch(`${AUTH_URL}/verify`, {
      headers: { Authorization: authorization, "X-Internal-Key": INTERNAL_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return res.status(401).json({ detail: "Session expirée, reconnectez-vous" });
    req.user = (await r.json()) as User;
    next();
  } catch {
    res.status(503).json({ detail: "Service d'authentification indisponible" });
  }
}

// Les en-têtes HTTP n'acceptent pas les accents : le pseudo est encodé
const identity = (req: AuthedRequest) => ({
  "X-User-Id": String(req.user!.id),
  "X-User-Pseudo": encodeURIComponent(req.user!.pseudo),
});

// ---------- Santé : le BFF vérifie aussi ses microservices ----------
app.get("/api/health", async (_req, res) => {
  const ping = async (url: string) => {
    try {
      const r = await fetch(`${url}/health`, { headers: { "X-Internal-Key": INTERNAL_KEY }, signal: AbortSignal.timeout(2000) });
      return r.ok ? "ok" : "erreur";
    } catch {
      return "hors ligne";
    }
  };
  const [auth, metier] = await Promise.all([ping(AUTH_URL), ping(METIER_URL)]);
  res.status(auth === "ok" && metier === "ok" ? 200 : 503).json({ bff: "ok", "api-auth": auth, "api-metier": metier });
});

// ---------- Authentification -> API Auth ----------
app.post("/api/auth/register", limiteAuth, (req, res) =>
  callService(res, AUTH_URL, "/register", {
    method: "POST",
    body: { email: req.body?.email, pseudo: req.body?.pseudo, password: req.body?.password },
  })
);
app.post("/api/auth/login", limiteAuth, (req, res) =>
  callService(res, AUTH_URL, "/login", { method: "POST", body: { email: req.body?.email, password: req.body?.password } })
);
app.get("/api/auth/me", requireAuth, (req: AuthedRequest, res) => res.json(req.user));

// ---------- Jeu -> API Métier (liste blanche des routes autorisées) ----------
const ROUTES_JEU: Array<[string, RegExp]> = [
  ["POST", /^\/parties$/],
  ["GET", /^\/parties\/mes$/],
  ["POST", /^\/parties\/rejoindre$/],
  ["GET", /^\/parties\/\d+$/],
  ["PUT", /^\/parties\/\d+$/],
  ["DELETE", /^\/parties\/\d+$/],
  ["POST", /^\/parties\/\d+\/quitter$/],
  ["DELETE", /^\/parties\/\d+\/joueurs\/\d+$/],
  ["POST", /^\/parties\/\d+\/attribuer$/],
  ["POST", /^\/parties\/\d+\/demarrer$/],
  ["POST", /^\/parties\/\d+\/indices\/\d+\/debloquer$/],
  ["POST", /^\/parties\/\d+\/vote\/ouvrir$/],
  ["POST", /^\/parties\/\d+\/votes$/],
  ["POST", /^\/parties\/\d+\/terminer$/],
];

app.use("/api/parties", limiteJeu, requireAuth, (req: AuthedRequest, res) => {
  const chemin = "/parties" + (req.path === "/" ? "" : req.path);
  const autorisee = ROUTES_JEU.some(([methode, motif]) => methode === req.method && motif.test(chemin));
  if (!autorisee) return res.status(404).json({ detail: "Route inconnue" });
  const avecCorps = ["POST", "PUT"].includes(req.method);
  callService(res, METIER_URL, chemin, {
    method: req.method,
    body: avecCorps ? req.body ?? {} : undefined,
    headers: identity(req),
  });
});

app.use((_req, res) => res.status(404).json({ detail: "Route inconnue" }));

app.listen(PORT, () => console.log(`BFF MurderNight démarré sur le port ${PORT}`));
