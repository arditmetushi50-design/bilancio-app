import os
import shutil
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from models import CategoryCorrection
from schemas import OcrResult
from services import ocr_service
from services.classifier import classify

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.post("/upload", response_model=OcrResult)
async def upload_image(
    file: UploadFile = File(...),
    hint: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    # Valida tipo file
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Tipo file non supportato: {file.content_type}")

    # Salva file temporaneo
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    tmp_path = os.path.join(UPLOAD_DIR, f"ocr_tmp_{file.filename}")
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        # OCR
        result = ocr_service.process_image(tmp_path)

        # Classifica
        ocr_description = result.get("description", "")
        amount = result.get("amount")

        # Combina hint utente + testo OCR: hint ha priorità alta
        # Se l'utente ha scritto "benzina" + foto scontrino → AUTOMOBILE sicuro
        if hint and hint.strip():
            combined_description = f"{hint.strip()} {ocr_description}".strip()
        else:
            combined_description = ocr_description

        description = hint.strip() if hint and hint.strip() else ocr_description

        # Carica regole apprese
        learned = db.query(CategoryCorrection).all()
        learned_rules = [
            {"description_normalized": c.description_normalized, "final_category": c.final_category}
            for c in learned
        ]

        proposed_cat, confidence = classify(combined_description, amount, learned_rules)

        # Auto-negate for expense categories
        INCOME_CATEGORIES = {"STIPENDIO", "CONTRIBUTO MOGLIE", "ALTRE ENTRATE"}
        if amount is not None and amount > 0 and proposed_cat not in INCOME_CATEGORIES:
            amount = -amount

        return OcrResult(
            raw_text=result.get("raw_text", ""),
            amount=amount,
            description=description,
            date_hint=None,
            proposed_category=proposed_cat,
            confidence=confidence,
            year_hint=result.get("year_hint"),
            month_hint=result.get("month_hint"),
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
