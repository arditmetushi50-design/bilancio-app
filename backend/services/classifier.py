"""
Classificatore categoria basato su regole keyword + apprendimento correzioni.
Mai inventa una categoria: se confidenza bassa → ALTRO.
"""
import re
from typing import Optional, Tuple

# Regole base: (keyword_pattern, categoria, priorità)
BASE_RULES: list[tuple[str, str, int]] = [
    # STIPENDIO (massima priorità assoluta — override qualsiasi altra regola)
    (r"\bstipendio\s+o\s+pensione\b", "STIPENDIO", 105),   # ← descrizione banca
    (r"\bstipendio\b", "STIPENDIO", 100),
    (r"\bstipendio\s+ardit\b", "STIPENDIO", 101),
    (r"\bstipendio\s+met\b", "STIPENDIO", 101),
    (r"\bpensione\b", "STIPENDIO", 95),                     # bonifico pensione INPS
    (r"\baccredito\s+stipendio\b", "STIPENDIO", 105),
    (r"\bpagamento\s+stipendio\b", "STIPENDIO", 105),

    # CONTRIBUTO MOGLIE
    (r"\bfelisia\b", "CONTRIBUTO MOGLIE", 90),
    (r"\bfefi\b", "CONTRIBUTO MOGLIE", 90),
    (r"\bfefi\s+love\b", "CONTRIBUTO MOGLIE", 91),
    (r"\bura\s+felisia\b|\bfelisia\s+ura\b", "CONTRIBUTO MOGLIE", 92),

    # NETFLIX
    (r"\bnetflix\b", "NETFLIX", 80),

    # VODAFONE / telefono
    (r"\bvodafone\b", "VODAFONE", 80),
    (r"\btim\b", "VODAFONE", 75),
    (r"\bwind\b", "VODAFONE", 75),
    (r"\biliad\b", "VODAFONE", 75),
    (r"\binternet\b", "VODAFONE", 70),
    (r"\btelefono\b", "VODAFONE", 70),
    (r"\bricarica\s+(telefon|vodafone|sim)", "VODAFONE", 75),
    (r"\bcanone\s+vodafone\b", "VODAFONE", 80),

    # LUCE
    (r"\benel\b", "LUCE", 80),
    (r"\bluce\b", "LUCE", 80),
    (r"\bbolletta\s+luce\b", "LUCE", 85),
    (r"\benergia\b", "LUCE", 70),

    # GAS
    (r"\bgas\b", "GAS", 80),
    (r"\bbolletta\s+gas\b", "GAS", 85),

    # ACQUA
    (r"\bacqua\b", "ACQUA", 80),
    (r"\bbolletta\s+acqua\b", "ACQUA", 85),

    # AFFITTO
    (r"\baffitto\b", "AFFITTO", 85),
    (r"\brat[ae]\s+casa\b", "AFFITTO", 85),

    # TASSE
    (r"\bimu\b", "TASSE", 85),
    (r"\btari\b", "TASSE", 85),
    (r"\bf24\b", "TASSE", 85),
    (r"\btass[ae]\b", "TASSE", 80),
    (r"\binarcassa\b", "TASSE", 85),
    (r"\bcontribut[oi]\b", "TASSE", 70),
    (r"\bmarche?\s+da\s+bollo\b", "TASSE", 80),
    (r"\bagenzia\s+entrate\b", "TASSE", 85),

    # AUTOMOBILE
    (r"\bgpl\b", "AUTOMOBILE", 80),
    (r"\bbenzina\b", "AUTOMOBILE", 80),
    (r"\bdiesel\b", "AUTOMOBILE", 80),
    (r"\bcarburante\b", "AUTOMOBILE", 80),
    (r"\bmetano\b", "AUTOMOBILE", 78),
    (r"\bautostrada\b", "AUTOMOBILE", 75),
    (r"\bcasello\b", "AUTOMOBILE", 75),
    (r"\bbollo\s+auto\b", "AUTOMOBILE", 85),
    (r"\briparazione\s+auto\b", "AUTOMOBILE", 85),
    (r"\bautogril\b", "AUTOMOBILE", 72),
    (r"\bpezz[oi]\s+ricambio\b", "AUTOMOBILE", 80),
    (r"\bolio\s+macchina\b", "AUTOMOBILE", 80),
    # Distributori / stazioni di servizio per nome
    (r"\bdistributore\b", "AUTOMOBILE", 82),
    (r"\bstazione\s+(?:di\s+)?servizio\b", "AUTOMOBILE", 85),
    (r"\b(?:agip|esso|q8|tamoil|shell|totalerg|total|repsol|ip\b)", "AUTOMOBILE", 88),
    (r"\bgoldengas\b", "AUTOMOBILE", 88),
    (r"\benilive\b|\beni\b", "AUTOMOBILE", 85),
    (r"\bparcheggio\b", "AUTOMOBILE", 75),
    (r"\btelpass\b|\bautopass\b|\btelepass\b", "AUTOMOBILE", 85),
    (r"\bpv\d{3,}", "AUTOMOBILE", 72),  # "PV1010" = punto vendita carburante

    # SPESA SPORT
    (r"\bcalcetto\b", "SPESA SPORT", 85),
    (r"\bsport\b", "SPESA SPORT", 70),
    (r"\bdecathlon\b", "SPESA SPORT", 85),
    (r"\bpallone\b", "SPESA SPORT", 75),
    (r"\bcalcio\b", "SPESA SPORT", 72),
    (r"\bpalestra\b|\bgym\b|\bfitness\b", "SPESA SPORT", 82),

    # SPESE ALIMENTARI
    (r"\bcoop\b", "SPESE ALIMENTARI", 85),
    (r"\bconad\b", "SPESE ALIMENTARI", 85),
    (r"\blidl\b", "SPESE ALIMENTARI", 85),
    (r"\btigre\b", "SPESE ALIMENTARI", 82),
    (r"\bgala\b", "SPESE ALIMENTARI", 80),
    (r"\beurospin\b", "SPESE ALIMENTARI", 85),
    (r"\bipercoop\b", "SPESE ALIMENTARI", 85),
    (r"\bipercop\b", "SPESE ALIMENTARI", 85),
    (r"\bsupermercato\b", "SPESE ALIMENTARI", 80),
    (r"\bspesa\b", "SPESE ALIMENTARI", 65),
    (r"\bpizzeria\b", "SPESE ALIMENTARI", 72),
    (r"\bgelateria\b", "SPESE ALIMENTARI", 72),
    (r"\bcena\b", "SPESE ALIMENTARI", 60),
    (r"\bpranzo\b", "SPESE ALIMENTARI", 60),
    (r"\bmc\b|\bmcdonald\b", "SPESE ALIMENTARI", 78),
    (r"\bbar\b", "SPESE ALIMENTARI", 55),
    # Supermercati italiani per nome
    (r"\btodis\b", "SPESE ALIMENTARI", 88),
    (r"\bcarrefour\b", "SPESE ALIMENTARI", 88),
    (r"\bpenny\b", "SPESE ALIMENTARI", 85),
    (r"\baldi\b", "SPESE ALIMENTARI", 85),
    (r"\bmd\s+(?:discount|store|market)\b|\b(?<!\w)md(?!\w)\b", "SPESE ALIMENTARI", 80),
    (r"\bbilla\b", "SPESE ALIMENTARI", 88),
    (r"\bspar\b|\bdespar\b|\beurospar\b", "SPESE ALIMENTARI", 88),
    (r"\bpam\b", "SPESE ALIMENTARI", 80),
    (r"\bsimply\b", "SPESE ALIMENTARI", 82),
    (r"\bicm\b", "SPESE ALIMENTARI", 80),
    (r"\biperstore\b", "SPESE ALIMENTARI", 82),
    (r"\bfood\b", "SPESE ALIMENTARI", 58),
    (r"\bcaffe\b|\bcaffè\b", "SPESE ALIMENTARI", 62),
    (r"\btrattoria\b|\bosteria\b|\bristorante\b", "SPESE ALIMENTARI", 72),
    (r"\btavola\s+calda\b|\btake\s*away\b", "SPESE ALIMENTARI", 72),

    # USCITE E VACANZE
    (r"\bvacanz[ae]\b", "USCITE E VACANZE", 85),
    (r"\btreni[Tt]alia\b", "USCITE E VACANZE", 80),
    (r"\btreno\b", "USCITE E VACANZE", 75),
    (r"\bvolo\b", "USCITE E VACANZE", 80),
    (r"\balbergo\b", "USCITE E VACANZE", 80),
    (r"\bhotel\b", "USCITE E VACANZE", 80),
    (r"\bcinema\b", "USCITE E VACANZE", 75),
    (r"\bteatro\b", "USCITE E VACANZE", 75),

    # ALTRE ENTRATE
    (r"\baltre?\s+entrat[ae]\b", "ALTRE ENTRATE", 85),
    (r"\brimborso\b", "ALTRE ENTRATE", 65),
]

# Soglia minima confidenza per classificare (sotto → ALTRO)
CONFIDENCE_THRESHOLD = 60


def _normalize(text: str) -> str:
    return text.lower().strip()


def classify(description: str, amount: Optional[float] = None,
             learned_rules: Optional[list[dict]] = None) -> Tuple[str, float]:
    """
    Restituisce (categoria, confidenza 0-100).
    Se confidenza < CONFIDENCE_THRESHOLD → ("ALTRO", confidenza).
    """
    text = _normalize(description)
    best_cat = "ALTRO"
    best_score = 0.0

    # 1. Regole apprese (massima priorità)
    if learned_rules:
        for rule in learned_rules:
            if rule["description_normalized"] in text:
                return rule["final_category"], 95.0

    # 2. Regole base
    for pattern, category, priority in BASE_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            score = float(priority)
            if score > best_score:
                best_score = score
                best_cat = category

    # 3. Override per segno importo sulle entrate
    if amount is not None and amount > 1000 and best_score < 80:
        # Importo alto positivo → probabile stipendio
        best_cat = "STIPENDIO"
        best_score = 70.0

    if best_score < CONFIDENCE_THRESHOLD:
        return "ALTRO", best_score

    return best_cat, min(best_score, 99.0)


def record_correction(db, description: str, proposed_cat: Optional[str], final_cat: str):
    """
    Registra una correzione categoria per l'apprendimento.
    Se esiste già una correzione per questa descrizione, aggiorna e incrementa il conteggio.
    """
    from models import CategoryCorrection

    norm = _normalize(description)[:100]
    existing = db.query(CategoryCorrection).filter(
        CategoryCorrection.description_normalized == norm
    ).first()

    if existing:
        existing.final_category = final_cat
        existing.correction_count += 1
    else:
        db.add(CategoryCorrection(
            description_normalized=norm,
            proposed_category=proposed_cat,
            final_category=final_cat,
        ))
    db.commit()


def classify_batch(items: list[dict]) -> list[dict]:
    """items: [{description, amount}] → aggiunge proposed_category e confidence"""
    results = []
    for item in items:
        cat, conf = classify(item.get("description", ""), item.get("amount"))
        results.append({**item, "proposed_category": cat, "confidence": conf})
    return results
