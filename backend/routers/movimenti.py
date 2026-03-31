from typing import Optional
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Transaction, Category, CategoryCorrection
from schemas import TransactionCreate, TransactionUpdate, TransactionOut
from services.classifier import record_correction

router = APIRouter(prefix="/api/movimenti", tags=["movimenti"])


@router.get("/", response_model=list[TransactionOut])
def get_movimenti(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if year:
        q = q.filter(Transaction.year == year)
    if month:
        q = q.filter(Transaction.month == month)
    if category_id:
        q = q.filter(Transaction.category_id == category_id)
    return q.order_by(Transaction.year, Transaction.month, Transaction.id).all()


@router.get("/search")
def search_movimenti(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Cerca transazioni per descrizione (case-insensitive), raggruppa per anno."""
    results = (
        db.query(Transaction)
        .filter(Transaction.description.ilike(f"%{q}%"))
        .order_by(Transaction.year.desc(), Transaction.month, Transaction.id)
        .all()
    )
    grouped: dict[int, list] = defaultdict(list)
    for t in results:
        cat = db.query(Category).get(t.category_id)
        grouped[t.year].append({
            "id": t.id,
            "year": t.year,
            "month": t.month,
            "category_id": t.category_id,
            "category": {"id": cat.id, "name": cat.name, "type": cat.type, "display_order": cat.display_order} if cat else None,
            "description": t.description,
            "amount": t.amount,
            "source": t.source,
        })
    # Return as array sorted by year descending (matches frontend type)
    return [
        {"year": year, "transactions": txs}
        for year, txs in sorted(grouped.items(), reverse=True)
    ]


@router.post("/", response_model=TransactionOut, status_code=201)
def create_movimento(data: TransactionCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).get(data.category_id)
    if not cat:
        raise HTTPException(404, "Categoria non trovata")

    # ── Duplicate detection ─────────────────────────────────────────────────
    if not data.force:
        desc_norm = data.description.strip().lower()
        candidates = (
            db.query(Transaction)
            .filter(Transaction.year == data.year, Transaction.month == data.month)
            .all()
        )
        for existing in candidates:
            same_desc = existing.description.strip().lower() == desc_norm
            same_amt = abs(existing.amount - data.amount) <= 0.01
            if same_desc and same_amt:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "DUPLICATE",
                        "message": (
                            f"Esiste già '{existing.description}' "
                            f"({existing.month}/{existing.year}, "
                            f"{'−' if existing.amount < 0 else '+'}"
                            f"{abs(existing.amount):.2f}€). È un duplicato?"
                        ),
                        "existing_id": existing.id,
                        "existing_description": existing.description,
                        "existing_amount": existing.amount,
                    },
                )

    # Strip internal-only `force` field before persisting
    payload = data.model_dump(exclude={"force"})
    t = Transaction(**payload)
    db.add(t)
    db.commit()
    db.refresh(t)

    # Apprendimento automatico: se OCR ha proposto una categoria diversa da quella finale
    if data.source == "ocr" and data.ocr_proposed_category:
        final_cat = db.query(Category).get(data.category_id)
        if final_cat and data.ocr_proposed_category != final_cat.name:
            record_correction(db, data.description, data.ocr_proposed_category, final_cat.name)

    return t


@router.put("/{movimento_id}", response_model=TransactionOut)
def update_movimento(
    movimento_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
):
    t = db.query(Transaction).get(movimento_id)
    if not t:
        raise HTTPException(404, "Movimento non trovato")

    # Traccia correzione categoria per apprendimento
    if data.category_id and data.category_id != t.category_id:
        new_cat = db.query(Category).get(data.category_id)
        if new_cat:
            proposed = t.ocr_proposed_category if t.source == "ocr" else None
            if not proposed:
                old_cat = db.query(Category).get(t.category_id)
                proposed = old_cat.name if old_cat else None
            record_correction(db, t.description, proposed, new_cat.name)

    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(t, key, val)

    db.commit()
    db.refresh(t)
    return t


@router.delete("/{movimento_id}", status_code=204)
def delete_movimento(movimento_id: int, db: Session = Depends(get_db)):
    t = db.query(Transaction).get(movimento_id)
    if not t:
        raise HTTPException(404, "Movimento non trovato")
    db.delete(t)
    db.commit()
