"""Tests de MurderNight : règles du jeu et scénario complet d'une partie."""
import os
import random
import tempfile
from urllib.parse import quote, unquote

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")

import pytest
from fastapi.testclient import TestClient

from main import app
from regles import attribution_aleatoire, calculer_resultat, verifier_attribution, generer_code, ALPHABET_CODE

KEY = {"X-Internal-Key": "cle-interne-dev"}


def qui(uid, pseudo):
    # Le BFF encode le pseudo (les en-têtes HTTP n'acceptent pas les accents)
    return {**KEY, "X-User-Id": str(uid), "X-User-Pseudo": quote(pseudo)}


ORGA, ALICE, BOB, CHLOE = qui(1, "Orga"), qui(2, "Alice"), qui(3, "Bob"), qui(4, "Chloé")

SCENARIO = {
    "titre": "Meurtre au manoir",
    "scenario": "Le comte a été retrouvé mort dans la bibliothèque.",
    "victime": "Le comte",
    "lieu": "Manoir Blackwood",
    "personnages": [
        {"nom": "La comtesse", "description": "Épouse", "secret": "Dettes de jeu", "est_coupable": True},
        {"nom": "Le majordome", "description": "Fidèle", "secret": "A volé l'argenterie"},
        {"nom": "La nièce", "description": "Héritière", "secret": "Fiancée en secret"},
    ],
    "indices": [
        {"texte": "Une tasse de thé empoisonnée", "visibilite": "public"},
        {"texte": "Tu as vu la comtesse sortir de la bibliothèque", "visibilite": "prive", "destinataire": 1},
    ],
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------- Règles pures ----------
def test_code_lisible():
    code = generer_code()
    assert len(code) == 6 and all(c in ALPHABET_CODE for c in code)


def test_coupable_toujours_distribue():
    for graine in range(50):
        choix = attribution_aleatoire([1, 2], [10, 11, 12, 13], coupable=12, rng=random.Random(graine))
        assert 12 in choix.values() and len(set(choix.values())) == 2


def test_trop_de_joueurs():
    with pytest.raises(ValueError):
        attribution_aleatoire([1, 2, 3], [10, 11], coupable=10)


def test_attribution_manuelle_sans_coupable_refusee():
    with pytest.raises(ValueError):
        verifier_attribution({1: 11, 2: 12}, [1, 2], [10, 11, 12], coupable=10)


def test_resultat_egalite_coupable_non_demasque():
    r = calculer_resultat({1: 10, 2: 11}, coupable=10)
    assert r["gagnants"] == [1] and r["coupable_demasque"] is False


# ---------- Scénario complet via l'API ----------
def test_partie_complete(client):
    # Création
    r = client.post("/parties", json=SCENARIO, headers=ORGA)
    assert r.status_code == 201, r.text
    partie = r.json()
    pid, code = partie["id"], partie["code"]
    assert partie["vue"] == "organisateur"
    coupable = next(p for p in partie["personnages"] if p["est_coupable"])

    # Sans coupable : refusé
    mauvais = {**SCENARIO, "personnages": [{**p, "est_coupable": False} for p in SCENARIO["personnages"]]}
    assert client.post("/parties", json=mauvais, headers=ORGA).status_code == 422

    # Les joueurs rejoignent avec le code
    for j in (ALICE, BOB, CHLOE):
        assert client.post("/parties/rejoindre", json={"code": code.lower()}, headers=j).json()["id"] == pid

    # Un inconnu ne voit pas la partie
    assert client.get(f"/parties/{pid}", headers=qui(99, "Intrus")).status_code == 403

    # Avant le démarrage, un joueur ne voit aucun personnage
    vue = client.get(f"/parties/{pid}", headers=ALICE).json()
    assert vue["mon_personnage"] is None and vue["personnages"] == []

    # Un joueur ne peut pas démarrer ; il faut d'abord attribuer
    assert client.post(f"/parties/{pid}/demarrer", headers=ALICE).status_code == 403
    assert client.post(f"/parties/{pid}/demarrer", headers=ORGA).status_code == 409
    vue_orga = client.post(f"/parties/{pid}/attribuer", json={"mode": "aleatoire"}, headers=ORGA).json()
    assert all(j["personnage_id"] for j in vue_orga["joueurs"])
    assert client.post(f"/parties/{pid}/demarrer", headers=ORGA).json()["statut"] == "en_cours"

    # Personne ne peut plus rejoindre
    assert client.post("/parties/rejoindre", json={"code": code}, headers=qui(5, "Retard")).status_code == 409

    # Chaque joueur voit SON secret, et seulement les infos publiques des autres
    roles = {j["pseudo"]: j["personnage_id"] for j in vue_orga["joueurs"]}
    for joueur in (ALICE, BOB, CHLOE):
        v = client.get(f"/parties/{pid}", headers=joueur).json()
        assert v["mon_personnage"]["id"] == roles[unquote(joueur["X-User-Pseudo"])]
        assert all("secret" not in p and "est_coupable" not in p for p in v["personnages"])

    # Indices : rien avant déblocage, puis l'indice privé n'arrive qu'à son destinataire
    for indice in vue_orga["indices"]:
        client.post(f"/parties/{pid}/indices/{indice['id']}/debloquer", headers=ORGA)
    majordome = next(p["id"] for p in vue_orga["personnages"] if p["nom"] == "Le majordome")
    for joueur in (ALICE, BOB, CHLOE):
        v = client.get(f"/parties/{pid}", headers=joueur).json()
        prives = [i for i in v["indices"] if i["visibilite"] == "prive"]
        assert len(prives) == (1 if v["mon_personnage"]["id"] == majordome else 0)

    # Vote
    assert client.post(f"/parties/{pid}/votes", json={"personnage_id": coupable["id"]}, headers=ALICE).status_code == 409
    client.post(f"/parties/{pid}/vote/ouvrir", headers=ORGA)
    votants = list((ALICE, BOB, CHLOE))
    for joueur in votants:
        mien = roles[unquote(joueur["X-User-Pseudo"])]
        if mien == coupable["id"]:
            cible = next(p for p in roles.values() if p != mien)
        else:
            cible = coupable["id"]
        # On ne peut pas s'accuser soi-même
        assert client.post(f"/parties/{pid}/votes", json={"personnage_id": mien}, headers=joueur).status_code == 400
        r = client.post(f"/parties/{pid}/votes", json={"personnage_id": cible}, headers=joueur)
        assert r.status_code == 201, r.text
    assert client.post(f"/parties/{pid}/votes", json={"personnage_id": coupable["id"]}, headers=ALICE).status_code == 409

    # Tout le monde a voté : partie terminée, coupable révélé
    fin = client.get(f"/parties/{pid}", headers=BOB).json()
    assert fin["statut"] == "terminee"
    assert fin["resultat"]["coupable"]["nom"] == "La comtesse"
    assert fin["resultat"]["coupable_demasque"] is True
    assert len(fin["resultat"]["gagnants"]) == 2


def test_mes_parties(client):
    r = client.get("/parties/mes", headers=ALICE).json()
    assert len(r["rejointes"]) >= 1 and r["organisees"] == []


def test_cle_interne_obligatoire(client):
    assert client.get("/parties/mes", headers={"X-User-Id": "1"}).status_code == 403
