"""
API Auth - MurderNight
Gère les comptes : inscription (email + pseudo), connexion, vérification du token JWT.
Base de données : BDD Auth (table users).
"""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# --- Configuration -----------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./auth.db")
JWT_SECRET = os.getenv("JWT_SECRET", "change-moi-en-production")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))  # une soirée entière
INTERNAL_KEY = os.getenv("INTERNAL_KEY", "cle-interne-dev")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


# --- Modèle BDD --------------------------------------------------------------
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    pseudo = Column(String(30), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# --- Schémas API -------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    pseudo: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-zÀ-ÿ0-9 _.-]+$")
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


# --- Utilitaires -------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_internal_key(x_internal_key: str = Header(default="")):
    """Seul le BFF connaît cette clé : l'API n'est pas appelable directement."""
    if x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=403, detail="Accès réservé au BFF")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "pseudo": user.pseudo,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def user_public(user: User) -> dict:
    return {"id": user.id, "email": user.email, "pseudo": user.pseudo}


# --- Application -------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(engine)  # crée les tables au démarrage
    yield


app = FastAPI(lifespan=lifespan, title="MurderNight - API Auth", dependencies=[Depends(check_internal_key)])


@app.get("/health")
def health():
    return {"status": "ok", "service": "api-auth"}


@app.post("/register", status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    pseudo = data.pseudo.strip()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")
    if db.query(User).filter(User.pseudo.ilike(pseudo)).first():
        raise HTTPException(status_code=409, detail="Ce pseudo est déjà pris")
    user = User(email=email, pseudo=pseudo, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user), "user": user_public(user)}


@app.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    return {"token": create_token(user), "user": user_public(user)}


@app.get("/verify")
def verify(authorization: str = Header(default="")):
    """Le BFF appelle cette route pour savoir qui est connecté."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token manquant")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")
    return {"id": int(payload["sub"]), "email": payload["email"], "pseudo": payload["pseudo"]}
