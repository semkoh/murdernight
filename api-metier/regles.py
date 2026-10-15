"""
Règles du jeu MurderNight, sans base de données (faciles à tester).
"""
import random
import secrets

# Pas de 0/O ni 1/I/L : un code facile à lire et à dicter à voix haute
ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

STATUTS = ["preparation", "en_cours", "vote", "terminee"]


def generer_code(longueur: int = 6) -> str:
    return "".join(secrets.choice(ALPHABET_CODE) for _ in range(longueur))


def attribution_aleatoire(joueurs: list[int], personnages: list[int], coupable: int,
                          rng: random.Random | None = None) -> dict[int, int]:
    """
    Donne un personnage différent à chaque joueur.
    S'il y a moins de joueurs que de personnages, le coupable est toujours distribué :
    sinon personne ne pourrait être démasqué.
    """
    rng = rng or random.Random()
    if len(joueurs) > len(personnages):
        raise ValueError(f"Il y a {len(joueurs)} joueurs pour seulement {len(personnages)} personnages")
    autres = [p for p in personnages if p != coupable]
    rng.shuffle(autres)
    choisis = [coupable] + autres[: len(joueurs) - 1]
    rng.shuffle(choisis)
    return dict(zip(joueurs, choisis))


def verifier_attribution(attribution: dict[int, int], joueurs: list[int], personnages: list[int], coupable: int):
    """Lève ValueError avec un message clair si l'attribution manuelle n'est pas valide."""
    manquants = [j for j in joueurs if j not in attribution]
    if manquants:
        raise ValueError("Chaque joueur doit recevoir un personnage")
    valeurs = list(attribution.values())
    if len(set(valeurs)) != len(valeurs):
        raise ValueError("Deux joueurs ne peuvent pas avoir le même personnage")
    if any(p not in personnages for p in valeurs):
        raise ValueError("Personnage inconnu dans cette partie")
    if coupable not in valeurs:
        raise ValueError("Le coupable doit être joué par quelqu'un")


def calculer_resultat(votes: dict[int, int], coupable: int) -> dict:
    """
    votes : {joueur_id: personnage_accusé_id}
    Renvoie le décompte, les joueurs qui ont trouvé, et si le coupable s'en sort.
    """
    decompte: dict[int, int] = {}
    for accuse in votes.values():
        decompte[accuse] = decompte.get(accuse, 0) + 1
    max_voix = max(decompte.values(), default=0)
    plus_accuses = [p for p, n in decompte.items() if n == max_voix and max_voix > 0]
    return {
        "decompte": decompte,
        "gagnants": [j for j, accuse in votes.items() if accuse == coupable],
        # Le coupable est démasqué seulement s'il est SEUL en tête des votes
        "coupable_demasque": plus_accuses == [coupable],
    }
