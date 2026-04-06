"""
OCR service: immagine → testo grezzo → parsing importo/data/descrizione.
Supporta due modalità:
  - "single": scontrino/ricevuta (una transazione)
  - "multi":  estratto conto bancario/carta (lista di transazioni)
"""
import re
import os
from typing import Optional
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageFilter, ImageEnhance, ImageOps

try:
    import pytesseract
    tesseract_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for p in tesseract_paths:
        if os.path.exists(p):
            pytesseract.pytesseract.tesseract_cmd = p
            break

    _local_tessdata = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "tessdata")
    )
    if os.path.isdir(_local_tessdata):
        os.environ["TESSDATA_PREFIX"] = _local_tessdata

    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


# ── Mesi inglesi (estratti conto internazionali) ─────────────────────────────
MONTHS_EN = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
}

# Parole UI da ignorare nei merchant name (navigazione app banca)
UI_NOISE = {
    "home", "conti", "carta", "card", "shop", "insights", "mercato",
    "pro", "trading", "fai", "menu", "back", "search", "close",
    "notifiche", "profilo", "settings", "impostazioni",
}


# ── Pre-processing immagine ───────────────────────────────────────────────────

def _preprocess_image(img: Image.Image) -> Image.Image:
    """Converte in scala di grigi, inverte se sfondo scuro (dark mode app)."""
    gray = img.convert("L")
    # Rileva sfondo scuro: media pixel < 100 → inverte (testo bianco su scuro)
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    if avg < 100:
        gray = ImageOps.invert(gray)
    gray = ImageEnhance.Contrast(gray).enhance(2.0)
    gray = gray.filter(ImageFilter.SHARPEN)
    return gray


# ── Rilevamento estratto conto ────────────────────────────────────────────────

def _is_bank_statement(text: str) -> bool:
    """
    Restituisce True se il testo sembra un estratto conto con più transazioni.
    Criteri: almeno 3 occorrenze di "EUR" OPPURE almeno 2 intestazioni di data
    del tipo "Mon, Mar 30" / "Lun 30 mar".
    """
    eur_count = len(re.findall(r"\bEUR\b", text, re.IGNORECASE))
    if eur_count >= 3:
        return True
    date_headers = re.findall(
        r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,.\s]",
        text, re.IGNORECASE
    )
    if len(date_headers) >= 2:
        return True
    # Formato italiano: "lun", "mar", "mer", "gio", "ven", "sab", "dom"
    it_headers = re.findall(
        r"\b(?:lun|mar|mer|gio|ven|sab|dom)[,.\s]",
        text, re.IGNORECASE
    )
    if len(it_headers) >= 2:
        return True
    return False


# ── Parsing estratto conto ────────────────────────────────────────────────────

def _parse_bank_statement(text: str) -> list[dict]:
    """
    Estrae lista transazioni da testo OCR di estratto conto bancario.
    Gestisce formato: "Tue, Mar 31\\nMerchant Name  €17,90 EUR"
    """
    now = datetime.now()
    current_year = now.year
    current_month_num = now.month

    transactions: list[dict] = []
    current_month: Optional[int] = None
    year = current_year

    # Intestazione data inglese: "Tue, Mar 31" / "Wed Mar 30"
    date_en_pat = re.compile(
        r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,.\s]+([A-Za-z]{3,9})[,.\s]+(\d{1,2})\b",
        re.IGNORECASE,
    )
    # Intestazione data italiana: "lun 30 mar" / "lun, 30 marzo"
    date_it_pat = re.compile(
        r"\b(?:lun|mar|mer|gio|ven|sab|dom)[,.\s]+(\d{1,2})[,.\s]+([A-Za-z]{3,})\b",
        re.IGNORECASE,
    )

    # Importo: "€17,90 EUR" / "17.90 EUR" / "€ 17,90" / "1.234,56 EUR"
    amount_pat = re.compile(
        r"(?:€\s*)?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:EUR|€)",
        re.IGNORECASE,
    )

    lines = text.split("\n")

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # --- Prova intestazione data EN ---
        m = date_en_pat.search(line)
        if m:
            month_str = m.group(1).lower()[:3]
            new_month = MONTHS_EN.get(month_str)
            if new_month:
                if new_month > current_month_num + 2:
                    year = current_year - 1
                else:
                    year = current_year
                current_month = new_month
                try:
                    current_day = int(m.group(2))
                except (ValueError, IndexError):
                    current_day = None
            continue

        # --- Prova intestazione data IT ---
        m = date_it_pat.search(line)
        if m:
            month_str = m.group(2).lower()[:3]
            new_month = MONTHS_EN.get(month_str)
            if new_month:
                if new_month > current_month_num + 2:
                    year = current_year - 1
                else:
                    year = current_year
                current_month = new_month
                try:
                    current_day = int(m.group(1))
                except (ValueError, IndexError):
                    current_day = None
            continue

        # Senza data corrente non sappiamo a quale mese appartiene
        if current_month is None:
            continue

        # --- Prova riga transazione ---
        am = amount_pat.search(line)
        if not am:
            continue

        raw = am.group(1)
        # Normalizza formato italiano (1.234,56) e inglese (1,234.56)
        if re.search(r",\d{2}$", raw):
            raw = raw.replace(".", "").replace(",", ".")
        elif re.search(r"\.\d{2}$", raw):
            raw = raw.replace(",", "")
        try:
            amount = float(raw)
        except ValueError:
            continue

        # Descrizione = tutto prima dell'importo
        desc = line[: am.start()].strip()
        desc = re.sub(r"\s{2,}", " ", desc)
        desc = re.sub(r"[^\w\s'\-&./]", "", desc).strip()

        if not desc or len(desc) < 2:
            continue

        # Scarta righe che sono solo numeri (es. orario "08:25")
        if re.match(r"^[\d:.,\s]+$", desc):
            continue

        # Scarta elementi UI della navigazione app
        words = set(desc.lower().split())
        if words and words.issubset(UI_NOISE):
            continue

        # Rimuovi prefissi spuri da OCR: "&", "A", "The", singoli caratteri non-alfanumerici
        desc = re.sub(r"^(?:[&@#*+\-]\s+|[A-Z]\s(?=[A-Z]))", "", desc).strip()
        # Se inizia con una singola lettera/simbolo seguita da spazio e poi testo reale, rimuovi
        desc = re.sub(r"^([^a-zA-Z0-9]{1,2}\s+)", "", desc).strip()
        if not desc or len(desc) < 2:
            continue

        # Prefisso giorno: "31_Distributore Ip"
        if current_day:
            desc = f"{current_day}_{desc}"

        transactions.append({
            "description": desc,
            "amount": amount,
            "year": year,
            "month": current_month,
            "day": current_day,
        })

    return transactions


# ── Estrazione importo (scontrino singolo) ────────────────────────────────────

def _extract_amount(text: str) -> Optional[float]:
    number_pat = r"[-−]?\s*€?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*€?"

    def _parse(match) -> Optional[float]:
        raw = match.group(1).replace(".", "").replace(",", ".")
        try:
            val = float(raw)
            if val == 0:
                return None
            if re.search(r"[-−]", match.group(0)):
                val = -abs(val)
            return val
        except ValueError:
            return None

    keyword_patterns = [
        r"TOTALE\s*COMPLESSIVO[:\s]*[-−]?\s*€?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",
        r"DA\s*PAGARE[:\s]*[-−]?\s*€?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",
        r"PAGAMENTO[:\s]*[-−]?\s*€?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",
        r"TOTALE[:\s]*[-−]?\s*€?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",
        r"IMPORTO[:\s]*[-−]?\s*€?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",
    ]
    for pat in keyword_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = _parse(m)
            if val is not None:
                return val

    all_amounts = []
    for m in re.finditer(number_pat, text, re.IGNORECASE):
        val = _parse(m)
        if val is not None:
            all_amounts.append(val)

    if all_amounts:
        return max(all_amounts, key=lambda x: abs(x))
    return None


def _extract_date(text: str) -> tuple[Optional[int], Optional[int]]:
    lines = text.lower()
    mesi_it = {
        "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4,
        "maggio": 5, "giugno": 6, "luglio": 7, "agosto": 8,
        "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
        "gen": 1, "feb": 2, "mar": 3, "apr": 4, "mag": 5, "giu": 6,
        "lug": 7, "ago": 8, "set": 9, "ott": 10, "nov": 11, "dic": 12,
    }
    for nome, num in mesi_it.items():
        if nome in lines:
            year_match = re.search(r"(20\d{2})", lines)
            return (int(year_match.group(1)) if year_match else None, num)

    m = re.search(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12:
            return (year, month)
        elif 1 <= day <= 12:
            return (year, day)

    m = re.search(r"(\d{1,2})[/\-.](\d{4})", text)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            return (year, month)

    m = re.search(r"(20\d{2})", text)
    if m:
        return (int(m.group(1)), None)
    return (None, None)


def _clean_description(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    meaningful = [l for l in lines if len(l) > 2 and not re.match(r"^[\d\s.,€/-]+$", l)]
    return " | ".join(meaningful[:3]) if meaningful else text[:100]


# ── Entry point ───────────────────────────────────────────────────────────────

def process_image(image_path: str) -> dict:
    """
    Esegue OCR sull'immagine.
    Ritorna dict con chiave 'mode':
      "single" → {raw_text, amount, description, year_hint, month_hint, confidence}
      "multi"  → {raw_text, mode, transactions: [{description, amount, year, month}]}
    """
    if not OCR_AVAILABLE:
        return {
            "raw_text": "", "amount": None, "description": "",
            "year_hint": None, "month_hint": None, "confidence": 0.0,
            "mode": "single",
            "error": "Tesseract non installato.",
        }

    try:
        img = Image.open(image_path)
        img_processed = _preprocess_image(img)

        # Prova PSM 4 (colonna di testo) per estratti conto, PSM 6 per scontrini
        config_col = "--oem 3 --psm 4"
        config_block = "--oem 3 --psm 6"

        try:
            raw_col = pytesseract.image_to_string(img_processed, lang="ita+eng", config=config_col)
        except Exception:
            raw_col = pytesseract.image_to_string(img_processed, config=config_col)

        try:
            raw_block = pytesseract.image_to_string(img_processed, lang="ita+eng", config=config_block)
        except Exception:
            raw_block = pytesseract.image_to_string(img_processed, config=config_block)

        # Scegli il testo con più corrispondenze EUR (più transazioni rilevate)
        eur_col = len(re.findall(r"\bEUR\b", raw_col, re.IGNORECASE))
        eur_block = len(re.findall(r"\bEUR\b", raw_block, re.IGNORECASE))
        raw_text = raw_col if eur_col >= eur_block else raw_block

        # ── Confidenza media ─────────────────────────────────────────────────
        try:
            data = pytesseract.image_to_data(img_processed, output_type=pytesseract.Output.DICT)
            confs = [int(c) for c in data["conf"] if str(c).isdigit() and int(c) >= 0]
            confidence = sum(confs) / len(confs) if confs else 50.0
        except Exception:
            confidence = 50.0

        # ── Modalità: estratto conto o scontrino? ────────────────────────────
        if _is_bank_statement(raw_text):
            transactions = _parse_bank_statement(raw_text)
            if transactions:
                return {
                    "raw_text": raw_text,
                    "mode": "multi",
                    "transactions": transactions,
                    "confidence": round(confidence, 1),
                }

        # ── Modalità singola (scontrino) ─────────────────────────────────────
        amount = _extract_amount(raw_text)
        year_hint, month_hint = _extract_date(raw_text)
        description = _clean_description(raw_text)

        return {
            "raw_text": raw_text,
            "amount": amount,
            "description": description,
            "year_hint": year_hint,
            "month_hint": month_hint,
            "confidence": round(confidence, 1),
            "mode": "single",
        }

    except Exception as e:
        return {
            "raw_text": "", "amount": None, "description": "",
            "year_hint": None, "month_hint": None, "confidence": 0.0,
            "mode": "single", "error": str(e),
        }
