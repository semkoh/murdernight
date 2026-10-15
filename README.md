# 🔪 MurderNight : l'application de Murder Party

Organisez une Murder Party depuis votre téléphone : l'organisateur écrit l'enquête, chaque joueur reçoit son rôle secret,
les indices se débloquent au fil de la soirée, et tout le monde vote pour le coupable à la fin.

Architecture : **1 front, 3 microservices, 2 bases de données**.

```
                 ┌──────────────┐      ┌───────────────┐      ┌────────────┐
 Téléphones ───► │ Front React  │ ───► │  BFF (TS)     │ ───► │ API Métier │ ───► BDD Métier
                 │  :5173       │      │  :3001        │      │ (Python)   │     (parties, personnages,
                 └──────────────┘      └──────┬────────┘      └────────────┘      roles, indices, votes)
                                              │
                                              ▼
                                       ┌───────────┐
                                       │ API Auth  │ ───► BDD Auth (users)
                                       │ (Python)  │
                                       └───────────┘
```

| Service | Techno | Port | Rôle |
|---|---|---|---|
| front | React + Vite | 5173 | Interface organisateur et joueurs (pensée pour le téléphone) |
| bff | TypeScript + Express | 3001 | Point d'entrée unique, vérifie le token, liste blanche des routes, limitation de débit |
| api-auth | Python + FastAPI | interne | Inscription (email + pseudo), connexion, JWT |
| api-metier | Python + FastAPI | interne | Parties, rôles, indices, votes, et filtrage de « qui voit quoi » |
| db-auth | PostgreSQL | interne | Table `users` |
| db-metier | PostgreSQL | interne | Tables `parties`, `personnages`, `roles`, `indices`, `votes` |

## Lancer le projet

Prérequis : **Docker Desktop** ouvert.

```bash
docker compose up --build
```

Puis ouvrez **http://localhost:5173**.

- Pour arrêter : `Ctrl + C`, puis `docker compose down`
- Pour repartir d'une base vide : `docker compose down -v`
- Port déjà utilisé ? Copiez `.env.example` en `.env` et changez `BFF_PORT` ou `FRONT_PORT`.
- Vérifier que les 3 services tournent : http://localhost:3001/api/health

### Jouer depuis les téléphones (même Wi-Fi)

Remplacez `localhost` par l'adresse IP du PC (commande `ipconfig`, ligne « Adresse IPv4 », par exemple 192.168.1.20) :
dans `.env`, mettez `PUBLIC_HOST=192.168.1.20`, relancez, puis ouvrez `http://192.168.1.20:5173` sur les téléphones.

## Déroulé d'une partie

1. **Préparation** : l'organisateur crée l'enquête (ou charge le scénario « Manoir Blackwood » en un clic) et partage le **code à 6 caractères** ou le lien d'invitation.
2. Les joueurs rejoignent. L'organisateur **distribue les rôles** (au hasard ou à la main), puis **lance l'enquête**.
3. **Enquête** : chaque joueur ouvre son **dossier secret** (alibi, secret, objectif). Le coupable sait qu'il est coupable.
   L'organisateur **révèle les indices** un par un ; un indice privé n'arrive qu'au joueur concerné.
4. **Vote** : chaque joueur accuse un suspect (pas lui-même, une seule fois).
5. **Révélation** automatique quand tout le monde a voté : coupable, décompte, qui avait trouvé.

Les écrans se mettent à jour tout seuls toutes les 3 secondes.

## Règles métier (api-metier)

- Exactement **un coupable**, entre 3 et 12 personnages, noms uniques.
- Statuts : `preparation → en_cours → vote → terminee`, chaque action vérifie le statut.
- Le coupable est **toujours distribué**, même s'il y a moins de joueurs que de personnages.
- Un joueur ne reçoit **que** : son propre dossier, les descriptions publiques des autres, les indices publics révélés et ses indices privés.
  Le filtrage est fait **côté serveur** : un joueur ne peut pas lire les secrets des autres, même en inspectant le réseau.
- Le coupable est « démasqué » seulement s'il est **seul en tête** des votes.

## Routes du BFF

| Méthode | Route | Accès |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | public (10 essais/minute) |
| GET | `/api/auth/me` | connecté |
| POST | `/api/parties` | connecté (devient organisateur) |
| GET | `/api/parties/mes` | connecté |
| POST | `/api/parties/rejoindre` | connecté |
| GET / PUT / DELETE | `/api/parties/:id` | joueur ou organisateur (PUT/DELETE : organisateur) |
| POST | `/api/parties/:id/attribuer` | organisateur |
| POST | `/api/parties/:id/demarrer` | organisateur |
| POST | `/api/parties/:id/indices/:iid/debloquer` | organisateur |
| POST | `/api/parties/:id/vote/ouvrir`, `/terminer` | organisateur |
| POST | `/api/parties/:id/votes` | joueur |
| POST | `/api/parties/:id/quitter` | joueur |
| DELETE | `/api/parties/:id/joueurs/:jid` | organisateur |
| GET | `/api/health` | public |

## Bases de données

**BDD Auth : `users`** : id, email (unique), pseudo (unique), password_hash (bcrypt), created_at

**BDD Métier**

| Table | Colonnes |
|---|---|
| `parties` | id, code (unique), titre, scenario, victime, lieu, statut, organisateur_id, organisateur_pseudo, created_at |
| `personnages` | id, partie_id, nom, description (publique), alibi, secret, objectif, est_coupable |
| `roles` | id, partie_id, joueur_id, pseudo, personnage_id (unique par partie et joueur) |
| `indices` | id, partie_id, ordre, texte, visibilite (public/prive), destinataire_id, debloque, debloque_at |
| `votes` | id, partie_id, joueur_id, accuse_id (un vote par joueur et par partie) |

`organisateur_id` et `joueur_id` viennent de l'API Auth : ce ne sont pas des clés étrangères, car les utilisateurs sont dans une autre base.

## Sécurité

- Mots de passe hachés (**bcrypt**), **JWT** signé (8 h, la durée d'une soirée)
- Les APIs refusent toute requête sans la **clé interne** du BFF ; elles ne sont pas exposées hors du réseau Docker
- Le BFF n'autorise qu'une **liste blanche** de routes et limite les tentatives de connexion
- Le pseudo est encodé dans les en-têtes (accents), les entrées sont validées par Pydantic

## Tests

```bash
cd api-metier && pip install -r requirements.txt pytest httpx && pytest
```

8 tests : règles du jeu et scénario complet (création, rejoindre, droits, indices privés, vote, révélation).

## Lancer sans Docker (développement)

```bash
cd api-auth   && pip install -r requirements.txt && uvicorn main:app --port 8001 --reload
cd api-metier && pip install -r requirements.txt && uvicorn main:app --port 8002 --reload
cd bff        && npm install && PORT=3001 npm run dev
cd front      && npm install && npm run dev
```

Sans `DATABASE_URL`, les APIs utilisent SQLite.
