"""
API Métier - MurderNight
Parties, personnages, rôles, indices et votes.
Règle d'or : chaque joueur ne reçoit QUE ce qu'il a le droit de voir (filtrage fait ici, côté serveur).
Base de données : BDD Métier.
"""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import (create_engine, Column, Integer, String, Text, DateTime, Boolean,
                        ForeignKey, UniqueConstraint, func)
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship

from regles import generer_code, attribution_aleatoire, verifier_attribution, calculer_resultat

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./metier.db")
INTERNAL_KEY = os.getenv("INTERNAL_KEY", "cle-interne-dev")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


def maintenant():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


# --- Modèles BDD -------------------------------------------------------------
class Partie(Base):
    __tablename__ = "parties"
    id = Column(Integer, primary_key=True)
    code = Column(String(6), unique=True, nullable=False, index=True)
    titre = Column(String(120), nullable=False)
    scenario = Column(Text, nullable=False)
    victime = Column(String(80), nullable=False)
    lieu = Column(String(120), nullable=False)
    statut = Column(String(15), nullable=False, default="preparation")  # preparation | en_cours | vote | terminee
    organisateur_id = Column(Integer, nullable=False, index=True)       # id venant de l'API Auth
    organisateur_pseudo = Column(String(30), nullable=False)
    created_at = Column(DateTime, default=maintenant)
    personnages = relationship("Personnage", cascade="all, delete-orphan", order_by="Personnage.id")
    indices = relationship("Indice", cascade="all, delete-orphan", order_by="Indice.ordre")
    roles = relationship("Role", cascade="all, delete-orphan", order_by="Role.id")
    votes = relationship("Vote", cascade="all, delete-orphan")


class Personnage(Base):
    __tablename__ = "personnages"
    id = Column(Integer, primary_key=True)
    partie_id = Column(Integer, ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(80), nullable=False)
    description = Column(Text, nullable=False, default="")  # public : ce que tout le monde sait
    alibi = Column(Text, nullable=False, default="")        # secret
    secret = Column(Text, nullable=False, default="")       # secret
    objectif = Column(Text, nullable=False, default="")     # secret
    est_coupable = Column(Boolean, nullable=False, default=False)


class Role(Base):
    """Un joueur dans une partie, et le personnage qu'il incarne."""
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("partie_id", "joueur_id"),)
    id = Column(Integer, primary_key=True)
    partie_id = Column(Integer, ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    joueur_id = Column(Integer, nullable=False, index=True)   # id venant de l'API Auth
    pseudo = Column(String(30), nullable=False)
    personnage_id = Column(Integer, ForeignKey("personnages.id", ondelete="SET NULL"), nullable=True)
    rejoint_at = Column(DateTime, default=maintenant)


class Indice(Base):
    __tablename__ = "indices"
    id = Column(Integer, primary_key=True)
    partie_id = Column(Integer, ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    ordre = Column(Integer, nullable=False)
    texte = Column(Text, nullable=False)
    visibilite = Column(String(10), nullable=False, default="public")  # public | prive
    destinataire_id = Column(Integer, ForeignKey("personnages.id", ondelete="SET NULL"), nullable=True)
    debloque = Column(Boolean, nullable=False, default=False)
    debloque_at = Column(DateTime, nullable=True)


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("partie_id", "joueur_id"),)
    id = Column(Integer, primary_key=True)
    partie_id = Column(Integer, ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    joueur_id = Column(Integer, nullable=False)
    accuse_id = Column(Integer, ForeignKey("personnages.id"), nullable=False)
    created_at = Column(DateTime, default=maintenant)


# --- Schémas API -------------------------------------------------------------
class PersonnageIn(BaseModel):
    nom: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=1000)
    alibi: str = Field(default="", max_length=1000)
    secret: str = Field(default="", max_length=1000)
    objectif: str = Field(default="", max_length=1000)
    est_coupable: bool = False


class IndiceIn(BaseModel):
    texte: str = Field(min_length=3, max_length=1000)
    visibilite: Literal["public", "prive"] = "public"
    destinataire: int | None = None  # position du personnage dans la liste (0, 1, 2…)


class PartieIn(BaseModel):
    titre: str = Field(min_length=3, max_length=120)
    scenario: str = Field(min_length=10, max_length=4000)
    victime: str = Field(min_length=2, max_length=80)
    lieu: str = Field(min_length=2, max_length=120)
    personnages: list[PersonnageIn] = Field(min_length=3, max_length=12)
    indices: list[IndiceIn] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def coherence(self):
        if sum(p.est_coupable for p in self.personnages) != 1:
            raise ValueError("Il faut exactement un coupable")
        noms = [p.nom.strip().lower() for p in self.personnages]
        if len(set(noms)) != len(noms):
            raise ValueError("Deux personnages ont le même nom")
        for i in self.indices:
            if i.visibilite == "prive" and (i.destinataire is None or not 0 <= i.destinataire < len(self.personnages)):
                raise ValueError("Un indice privé doit avoir un destinataire")
        return self


class RejoindreIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class AttributionIn(BaseModel):
    mode: Literal["aleatoire", "manuel"]
    attributions: dict[int, int] = Field(default_factory=dict)  # {joueur_id: personnage_id}


class VoteIn(BaseModel):
    personnage_id: int


# --- Dépendances -------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_internal_key(x_internal_key: str = Header(default="")):
    if x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Accès réservé au BFF")


def utilisateur(x_user_id: int | None = Header(default=None), x_user_pseudo: str = Header(default="")):
    """Le BFF a vérifié le token auprès de l'API Auth et transmet l'identité."""
    if x_user_id is None:
        raise HTTPException(status_code=401, detail="Connexion requise")
    return {"id": x_user_id, "pseudo": unquote(x_user_pseudo) or f"Joueur {x_user_id}"}


def charger_partie(pid: int, db: Session) -> Partie:
    partie = db.get(Partie, pid)
    if not partie:
        raise HTTPException(status_code=404, detail="Partie introuvable")
    return partie


def exiger_organisateur(partie: Partie, user: dict):
    if partie.organisateur_id != user["id"]:
        raise HTTPException(status_code=403, detail="Seul l'organisateur peut faire cela")


def exiger_statut(partie: Partie, *statuts: str):
    if partie.statut not in statuts:
        raise HTTPException(status_code=409, detail=f"Action impossible : la partie est « {partie.statut} »")


def coupable_de(partie: Partie) -> Personnage:
    return next(p for p in partie.personnages if p.est_coupable)


# --- Vues : ce que chacun a le droit de voir --------------------------------
def perso_public(p: Personnage) -> dict:
    return {"id": p.id, "nom": p.nom, "description": p.description}


def perso_complet(p: Personnage) -> dict:
    return {**perso_public(p), "alibi": p.alibi, "secret": p.secret, "objectif": p.objectif, "est_coupable": p.est_coupable}


def indice_dict(i: Indice, noms: dict[int, str]) -> dict:
    return {
        "id": i.id, "ordre": i.ordre, "texte": i.texte, "visibilite": i.visibilite,
        "destinataire_id": i.destinataire_id, "destinataire": noms.get(i.destinataire_id),
        "debloque": i.debloque, "debloque_at": iso(i.debloque_at),
    }


def resultat(partie: Partie) -> dict:
    coupable = coupable_de(partie)
    votes = {v.joueur_id: v.accuse_id for v in partie.votes}
    r = calculer_resultat(votes, coupable.id)
    pseudo_de = {ro.joueur_id: ro.pseudo for ro in partie.roles}
    joueur_coupable = next((ro.pseudo for ro in partie.roles if ro.personnage_id == coupable.id), None)
    return {
        "coupable": perso_complet(coupable),
        "joue_par": joueur_coupable,
        "coupable_demasque": r["coupable_demasque"],
        "votes": [
            {"personnage_id": p.id, "nom": p.nom, "voix": r["decompte"].get(p.id, 0)}
            for p in partie.personnages if r["decompte"].get(p.id)
        ],
        "gagnants": [pseudo_de[j] for j in r["gagnants"] if j in pseudo_de],
    }


def vue_partie(partie: Partie, user_id: int) -> dict:
    noms = {p.id: p.nom for p in partie.personnages}
    perso_en_jeu = {ro.personnage_id for ro in partie.roles if ro.personnage_id}
    commun = {
        "id": partie.id, "code": partie.code, "titre": partie.titre, "scenario": partie.scenario,
        "victime": partie.victime, "lieu": partie.lieu, "statut": partie.statut,
        "organisateur": partie.organisateur_pseudo, "created_at": iso(partie.created_at),
        "votes_recus": len(partie.votes), "nb_joueurs": len(partie.roles),
    }

    # L'organisateur voit tout : il est le maître du jeu
    if partie.organisateur_id == user_id:
        return {
            **commun,
            "vue": "organisateur",
            "personnages": [perso_complet(p) for p in partie.personnages],
            "joueurs": [{"joueur_id": ro.joueur_id, "pseudo": ro.pseudo, "personnage_id": ro.personnage_id,
                         "personnage": noms.get(ro.personnage_id),
                         "a_vote": any(v.joueur_id == ro.joueur_id for v in partie.votes)} for ro in partie.roles],
            "indices": [indice_dict(i, noms) for i in partie.indices],
            "resultat": resultat(partie) if partie.statut == "terminee" else None,
        }

    mon_role = next((ro for ro in partie.roles if ro.joueur_id == user_id), None)
    if not mon_role:
        raise HTTPException(status_code=403, detail="Vous ne participez pas à cette partie")

    mon_perso = next((p for p in partie.personnages if p.id == mon_role.personnage_id), None)
    demarree = partie.statut != "preparation"
    indices_visibles = [
        i for i in partie.indices
        if i.debloque and (i.visibilite == "public" or (mon_perso and i.destinataire_id == mon_perso.id))
    ]
    mon_vote = next((v for v in partie.votes if v.joueur_id == user_id), None)
    return {
        **commun,
        "vue": "joueur",
        # Le rôle n'est révélé qu'au démarrage de la partie
        "mon_personnage": perso_complet(mon_perso) if (mon_perso and demarree) else None,
        "personnages": [perso_public(p) for p in partie.personnages if p.id in perso_en_jeu] if demarree else [],
        "joueurs": [{"pseudo": ro.pseudo, "personnage": noms.get(ro.personnage_id) if demarree else None,
                     "moi": ro.joueur_id == user_id} for ro in partie.roles],
        "indices": [indice_dict(i, noms) for i in sorted(indices_visibles, key=lambda i: i.debloque_at or i.ordre)],
        "nb_indices_total": len(partie.indices),
        "mon_vote": mon_vote.accuse_id if mon_vote else None,
        "resultat": resultat(partie) if partie.statut == "terminee" else None,
    }


def remplir_partie(partie: Partie, data: PartieIn):
    partie.titre, partie.scenario = data.titre.strip(), data.scenario.strip()
    partie.victime, partie.lieu = data.victime.strip(), data.lieu.strip()
    partie.personnages = [Personnage(**p.model_dump()) for p in data.personnages]
    return partie


def remplir_indices(partie: Partie, data: PartieIn):
    persos = partie.personnages  # ids connus après flush
    partie.indices = [
        Indice(ordre=n + 1, texte=i.texte.strip(), visibilite=i.visibilite,
               destinataire_id=persos[i.destinataire].id if i.visibilite == "prive" else None)
        for n, i in enumerate(data.indices)
    ]


# --- Application -------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(engine)  # crée les tables au démarrage
    yield


app = FastAPI(lifespan=lifespan, title="MurderNight - API Métier", dependencies=[Depends(check_internal_key)])


@app.get("/health")
def health():
    return {"status": "ok", "service": "api-metier"}


@app.post("/parties", status_code=201)
def creer_partie(data: PartieIn, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    code = generer_code()
    while db.query(Partie).filter_by(code=code).first():
        code = generer_code()
    partie = remplir_partie(Partie(code=code, organisateur_id=user["id"], organisateur_pseudo=user["pseudo"]), data)
    db.add(partie)
    db.flush()
    remplir_indices(partie, data)
    db.commit()
    return vue_partie(partie, user["id"])


@app.put("/parties/{pid}")
def modifier_partie(pid: int, data: PartieIn, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    exiger_statut(partie, "preparation")
    for ro in partie.roles:  # le scénario change : les rôles sont à redistribuer
        ro.personnage_id = None
    partie.indices = []
    db.flush()
    remplir_partie(partie, data)
    db.flush()
    remplir_indices(partie, data)
    db.commit()
    return vue_partie(partie, user["id"])


@app.delete("/parties/{pid}", status_code=204)
def supprimer_partie(pid: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    db.delete(partie)
    db.commit()


@app.get("/parties/mes")
def mes_parties(user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    organisees = db.query(Partie).filter_by(organisateur_id=user["id"]).order_by(Partie.created_at.desc()).all()
    rejointes = (db.query(Partie).join(Role, Role.partie_id == Partie.id)
                 .filter(Role.joueur_id == user["id"]).order_by(Partie.created_at.desc()).all())
    resume = lambda p: {"id": p.id, "titre": p.titre, "code": p.code, "statut": p.statut, "lieu": p.lieu,
                        "nb_joueurs": len(p.roles), "organisateur": p.organisateur_pseudo, "created_at": iso(p.created_at)}
    return {"organisees": [resume(p) for p in organisees], "rejointes": [resume(p) for p in rejointes]}


@app.post("/parties/rejoindre")
def rejoindre(data: RejoindreIn, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = db.query(Partie).filter_by(code=data.code.upper()).first()
    if not partie:
        raise HTTPException(status_code=404, detail="Aucune partie avec ce code")
    if partie.organisateur_id == user["id"]:
        return {"id": partie.id}  # l'organisateur retrouve simplement sa partie
    if any(ro.joueur_id == user["id"] for ro in partie.roles):
        return {"id": partie.id}  # déjà inscrit : on le renvoie vers la partie
    exiger_statut(partie, "preparation")
    if len(partie.roles) >= len(partie.personnages):
        raise HTTPException(status_code=409, detail="La partie est complète")
    partie.roles.append(Role(joueur_id=user["id"], pseudo=user["pseudo"]))
    db.commit()
    return {"id": partie.id}


@app.get("/parties/{pid}")
def voir_partie(pid: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    return vue_partie(charger_partie(pid, db), user["id"])


@app.post("/parties/{pid}/quitter")
def quitter(pid: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_statut(partie, "preparation")
    partie.roles = [ro for ro in partie.roles if ro.joueur_id != user["id"]]
    db.commit()
    return {"ok": True}


@app.delete("/parties/{pid}/joueurs/{joueur_id}")
def exclure(pid: int, joueur_id: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    exiger_statut(partie, "preparation")
    partie.roles = [ro for ro in partie.roles if ro.joueur_id != joueur_id]
    db.commit()
    return vue_partie(partie, user["id"])


@app.post("/parties/{pid}/attribuer")
def attribuer(pid: int, data: AttributionIn, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    exiger_statut(partie, "preparation")
    joueurs = [ro.joueur_id for ro in partie.roles]
    persos = [p.id for p in partie.personnages]
    coupable = coupable_de(partie).id
    if not joueurs:
        raise HTTPException(status_code=409, detail="Aucun joueur n'a encore rejoint la partie")
    try:
        if data.mode == "aleatoire":
            choix = attribution_aleatoire(joueurs, persos, coupable)
        else:
            verifier_attribution(data.attributions, joueurs, persos, coupable)
            choix = data.attributions
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    for ro in partie.roles:
        ro.personnage_id = choix[ro.joueur_id]
    db.commit()
    return vue_partie(partie, user["id"])


@app.post("/parties/{pid}/demarrer")
def demarrer(pid: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    exiger_statut(partie, "preparation")
    if len(partie.roles) < 2:
        raise HTTPException(status_code=409, detail="Il faut au moins 2 joueurs")
    if any(ro.personnage_id is None for ro in partie.roles):
        raise HTTPException(status_code=409, detail="Tous les joueurs doivent avoir un personnage")
    if not any(ro.personnage_id == coupable_de(partie).id for ro in partie.roles):
        raise HTTPException(status_code=409, detail="Le coupable doit être joué par quelqu'un")
    partie.statut = "en_cours"
    db.commit()
    return vue_partie(partie, user["id"])


@app.post("/parties/{pid}/indices/{iid}/debloquer")
def debloquer(pid: int, iid: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    exiger_statut(partie, "en_cours", "vote")
    indice = next((i for i in partie.indices if i.id == iid), None)
    if not indice:
        raise HTTPException(status_code=404, detail="Indice introuvable")
    if not indice.debloque:
        indice.debloque, indice.debloque_at = True, maintenant()
        db.commit()
    return vue_partie(partie, user["id"])


@app.post("/parties/{pid}/vote/ouvrir")
def ouvrir_vote(pid: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    exiger_statut(partie, "en_cours")
    partie.statut = "vote"
    db.commit()
    return vue_partie(partie, user["id"])


@app.post("/parties/{pid}/votes", status_code=201)
def voter(pid: int, data: VoteIn, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_statut(partie, "vote")
    mon_role = next((ro for ro in partie.roles if ro.joueur_id == user["id"]), None)
    if not mon_role:
        raise HTTPException(status_code=403, detail="Seuls les joueurs peuvent voter")
    if any(v.joueur_id == user["id"] for v in partie.votes):
        raise HTTPException(status_code=409, detail="Vous avez déjà voté")
    if data.personnage_id == mon_role.personnage_id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous accuser vous-même")
    if data.personnage_id not in {ro.personnage_id for ro in partie.roles}:
        raise HTTPException(status_code=400, detail="Ce personnage n'est pas en jeu")
    partie.votes.append(Vote(joueur_id=user["id"], accuse_id=data.personnage_id))
    db.flush()
    if len(partie.votes) == len(partie.roles):  # tout le monde a voté : révélation automatique
        partie.statut = "terminee"
    db.commit()
    return vue_partie(partie, user["id"])


@app.post("/parties/{pid}/terminer")
def terminer(pid: int, user: dict = Depends(utilisateur), db: Session = Depends(get_db)):
    partie = charger_partie(pid, db)
    exiger_organisateur(partie, user)
    exiger_statut(partie, "vote")
    partie.statut = "terminee"
    db.commit()
    return vue_partie(partie, user["id"])
