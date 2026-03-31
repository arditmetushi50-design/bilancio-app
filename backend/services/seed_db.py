"""Popola categorie e regole di default al primo avvio."""
from sqlalchemy.orm import Session
from models import Category, CategoryRule


CATEGORIES = [
    # SPESE FISSE
    ("GAS",           "SPESA_FISSA",     1),
    ("LUCE",          "SPESA_FISSA",     2),
    ("ACQUA",         "SPESA_FISSA",     3),
    ("VODAFONE",      "SPESA_FISSA",     4),
    ("NETFLIX",       "SPESA_FISSA",     5),
    # SPESE VARIABILI
    ("SPESE ALIMENTARI", "SPESA_VARIABILE", 10),
    ("AUTOMOBILE",    "SPESA_VARIABILE", 11),
    ("SPESA SPORT",   "SPESA_VARIABILE", 12),
    ("USCITE E VACANZE", "SPESA_VARIABILE", 13),
    ("TASSE",         "SPESA_VARIABILE", 14),
    ("ALTRO",         "SPESA_VARIABILE", 15),
    # ENTRATE
    ("STIPENDIO",         "ENTRATA", 20),
    ("CONTRIBUTO MOGLIE", "ENTRATA", 21),
    ("ALTRE ENTRATE",     "ENTRATA", 22),
    ("AFFITTO",           "ENTRATA", 23),
]


def seed(db: Session):
    for name, cat_type, order in CATEGORIES:
        if not db.query(Category).filter(Category.name == name).first():
            db.add(Category(name=name, type=cat_type, display_order=order))
    db.commit()
