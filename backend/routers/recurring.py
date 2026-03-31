from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import RecurringTransaction, Transaction, Category

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


# --- Schemas ---

class RecurringCreate(BaseModel):
    category_id: int
    description: str
    amount: float
    day_of_month: int = 1
    active: bool = True


class RecurringUpdate(BaseModel):
    category_id: Optional[int] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    day_of_month: Optional[int] = None
    active: Optional[bool] = None


class RecurringOut(BaseModel):
    id: int
    category_id: int
    description: str
    amount: float
    day_of_month: int
    active: bool
    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.get("/", response_model=list[RecurringOut])
def list_recurring(db: Session = Depends(get_db)):
    return db.query(RecurringTransaction).all()


@router.post("/", response_model=RecurringOut, status_code=201)
def create_recurring(data: RecurringCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).get(data.category_id)
    if not cat:
        raise HTTPException(404, "Categoria non trovata")
    rec = RecurringTransaction(**data.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/{rec_id}", response_model=RecurringOut)
def update_recurring(rec_id: int, data: RecurringUpdate, db: Session = Depends(get_db)):
    rec = db.query(RecurringTransaction).get(rec_id)
    if not rec:
        raise HTTPException(404, "Transazione ricorrente non trovata")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(rec, key, val)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/{rec_id}", status_code=204)
def delete_recurring(rec_id: int, db: Session = Depends(get_db)):
    rec = db.query(RecurringTransaction).get(rec_id)
    if not rec:
        raise HTTPException(404, "Transazione ricorrente non trovata")
    db.delete(rec)
    db.commit()


@router.post("/apply/{year}/{month}")
def apply_recurring(year: int, month: int, db: Session = Depends(get_db)):
    """Applica tutte le transazioni ricorrenti attive a un mese specifico."""
    active_recs = db.query(RecurringTransaction).filter(
        RecurringTransaction.active == True
    ).all()

    created = []
    skipped = []

    for rec in active_recs:
        # Controlla se esiste già una transazione simile per questo mese
        exists = db.query(Transaction).filter(
            Transaction.year == year,
            Transaction.month == month,
            Transaction.category_id == rec.category_id,
            Transaction.description == rec.description,
            Transaction.amount == rec.amount,
        ).first()

        if exists:
            skipped.append(rec.description)
            continue

        t = Transaction(
            year=year,
            month=month,
            category_id=rec.category_id,
            description=rec.description,
            amount=rec.amount,
            source="recurring",
        )
        db.add(t)
        created.append(rec.description)

    db.commit()
    return {"created": created, "skipped": skipped, "year": year, "month": month}
