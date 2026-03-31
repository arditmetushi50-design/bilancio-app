"""
OCR service: immagine → testo grezzo → parsing importo/data/descrizione.
Usa pytesseract se disponibile, altrimenti restituisce errore chiaro.
"""
import re
import os
from typing import Optional
from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance

try:
    import pytesseract
    # Path Tesseract su Windows (default Tesseract installer)
    tesseract_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for p in tesseract_paths:
        if os.path.exists(p):
            pytesseract.pytesseract.tesseract_cmd = p
            break

    # Tessdata locale al progetto (include ita + eng senza bisogno di admin)
    _local_tessdata = os.path.join(os.path.dirname(__file__), "..", "tessdata")
    _local_tessdata = os.path.abspath(_local_tessdata)
    if os.path.isdir(_local_tessdata):
        os.environ["TESSDATA_PREFIX"] = _local_tessdata

    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


def _preprocess_image(img: Image.Image) -> Image.Image:
    """Migliora contrasto e sharpness per OCR migliore."""
    img = img.convert("L")  # grayscale
    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def _extract_amount(text: str) -> Optional[float]:
    """Cerca pattern importo: -123,45 / 1.234,56 / € 50 ecc.
    Preferisce importi vicini a keyword come TOTALE, DA PAGARE, ecc.
    Se non trovati, prende il numero più grande (probabile totale scontrino).
    """
    number_pat = r"[-−]?\s*€?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*€?"

    def _parse_amount(match) -> Optional[float]:
        raw = match.group(1).replace(".", "").replace(",", ".")
        try:
            val = float(raw)
            if val == 0:
                return None
            full_match = match.group(0)
            if re.search(r"[-−]", full_match):
                val = -abs(val)
            return val
        except ValueError:
            return None

    # 1. Look for amounts near keywords (TOTALE, IMPORTO, DA PAGARE, PAGAMENTO)
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
            val = _parse_amount(m)
            if val is not None:
                return val

    # 2. Collect all numbers and return the largest (likely the total on a receipt)
    all_amounts = []
    for m in re.finditer(number_pat, text, re.IGNORECASE):
        val = _parse_amount(m)
        if val is not None:
            all_amounts.append(val)

    if all_amounts:
        # Return the largest absolute value (preserving sign)
        return max(all_amounts, key=lambda x: abs(x))

    return None


def _extract_date(text: str) -> tuple[Optional[int], Optional[int]]:
    """Ritorna (year, month) se trovati nel testo."""
    lines = text.lower()

    # 1. Italian month names first (e.g., "26 marzo 2025", "marzo 2025")
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

    # 2. DD/MM/YYYY
    m = re.search(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12:
            return (year, month)
        elif 1 <= day <= 12:  # maybe DD/MM swapped
            return (year, day)

    # 3. MM/YYYY
    m = re.search(r"(\d{1,2})[/\-.](\d{4})", text)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12:
            return (year, month)

    # 4. Year only
    m = re.search(r"(20\d{2})", text)
    if m:
        return (int(m.group(1)), None)

    return (None, None)


def _clean_description(text: str) -> str:
    """Prende le prime righe significative come descrizione."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    # Rimuovi righe che sono solo numeri o punteggiatura
    meaningful = [l for l in lines if len(l) > 2 and not re.match(r"^[\d\s.,€/-]+$", l)]
    return " | ".join(meaningful[:3]) if meaningful else text[:100]


def process_image(image_path: str) -> dict:
    """
    Esegue OCR sull'immagine e restituisce:
    {raw_text, amount, description, year_hint, month_hint, confidence}
    """
    if not OCR_AVAILABLE:
        return {
            "raw_text": "",
            "amount": None,
            "description": "",
            "year_hint": None,
            "month_hint": None,
            "confidence": 0.0,
            "error": "Tesseract non installato. Installa da https://github.com/UB-Mannheim/tesseract/wiki"
        }

    try:
        img = Image.open(image_path)
        img_processed = _preprocess_image(img)

        # OCR con italiano + inglese
        config = "--oem 3 --psm 6"
        try:
            raw_text = pytesseract.image_to_string(img_processed, lang="ita+eng", config=config)
        except Exception:
            raw_text = pytesseract.image_to_string(img_processed, config=config)

        # Calcola confidenza media caratteri
        try:
            data = pytesseract.image_to_data(img_processed, output_type=pytesseract.Output.DICT)
            confs = [int(c) for c in data["conf"] if str(c).isdigit() and int(c) >= 0]
            confidence = sum(confs) / len(confs) if confs else 50.0
        except Exception:
            confidence = 50.0

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
        }

    except Exception as e:
        return {
            "raw_text": "",
            "amount": None,
            "description": "",
            "year_hint": None,
            "month_hint": None,
            "confidence": 0.0,
            "error": str(e)
        }
