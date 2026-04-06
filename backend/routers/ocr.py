import os
import shutil
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models import CategoryCorrection, Transaction
from schemas import OcrResult, OcrTransactionItem
from services import ocr_service
from services.classifier import classify

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

INCOME_CATEGORIES = {"STIPENDIO", "CONTRIBUTO MOGLIE", "ALTRE ENTRATE"}


def _get_learned_rules(db: Session) -> list[dict]:
    learned = db.query(CategoryCorrection).all()
    return [
        {"description_normalized": c.description_normalized, "final_category": c.final_category}
        for c in learned
    ]


def _auto_sign(amount: float, category: str) -> float:
    """Rende negativo l'importo per le categorie di spesa."""
    if amount > 0 and category not in INCOME_CATEGORIES:
        return -amount
    return amount


@router.post("/upload", response_model=OcrResult)
async def upload_image(
    file: UploadFile = File(...),
    hint: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Tipo file non supportato: {file.content_type}")

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    tmp_path = os.path.join(UPLOAD_DIR, f"ocr_tmp_{file.filename}")
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        result = ocr_service.process_image(tmp_path)
        learned_rules = _get_learned_rules(db)

        # ── MODALITÀ MULTI (estratto conto) ──────────────────────────────────
        if result.get("mode") == "multi" and result.get("transactions"):
            classified: list[OcrTransactionItem] = []
            for tx in result["transactions"]:
                cat, conf = classify(tx["description"], tx["amount"], learned_rules)
                amount = _auto_sign(tx["amount"], cat)
                classified.append(OcrTransactionItem(
                    description=tx["description"],
                    amount=amount,
                    year=tx["year"],
                    month=tx["month"],
                    proposed_category=cat,
                    confidence=conf,
                ))
            return OcrResult(
                raw_text=result.get("raw_text", ""),
                amount=None,
                description=None,
                date_hint=None,
                proposed_category=None,
                confidence=result.get("confidence", 0),
                year_hint=None,
                month_hint=None,
                mode="multi",
                transactions=classified,
            )

        # ── MODALITÀ SINGOLA (scontrino) ─────────────────────────────────────
        ocr_description = result.get("description", "")
        amount = result.get("amount")

        combined = f"{hint.strip()} {ocr_description}".strip() if hint and hint.strip() else ocr_description
        description = hint.strip() if hint and hint.strip() else ocr_description

        proposed_cat, confidence = classify(combined, amount, learned_rules)

        if amount is not None:
            amount = _auto_sign(amount, proposed_cat)

        return OcrResult(
            raw_text=result.get("raw_text", ""),
            amount=amount,
            description=description,
            date_hint=None,
            proposed_category=proposed_cat,
            confidence=confidence,
            year_hint=result.get("year_hint"),
            month_hint=result.get("month_hint"),
            mode="single",
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post("/check-duplicates")
def check_duplicates(
    items: list[dict],
    db: Session = Depends(get_db),
):
    """
    Controlla una lista di transazioni contro il DB.
    Input:  [{description, amount, year, month}, ...]
    Output: [{index, is_duplicate, existing_id?, existing_description?}, ...]
    """
    results = []
    for i, item in enumerate(items):
        desc_norm = item.get("description", "").strip().lower()
        amount = float(item.get("amount", 0))
        year = int(item.get("year", 0))
        month = int(item.get("month", 0))

        candidates = db.query(Transaction).filter(
            Transaction.year == year,
            Transaction.month == month,
        ).all()

        dup = None
        for t in candidates:
            if t.description.strip().lower() == desc_norm and abs(t.amount - amount) <= 0.01:
                dup = t
                break

        results.append({
            "index": i,
            "is_duplicate": dup is not None,
            "existing_id": dup.id if dup else None,
            "existing_description": dup.description if dup else None,
        })

    return results
