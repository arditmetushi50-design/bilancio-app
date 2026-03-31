from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import BudgetLimit, Category, Transaction

router = APIRouter(prefix="/api/budget", tags=["budget"])


# --- Schemas ---

class BudgetLimitCreate(BaseModel):
    category_id: int
    monthly_limit: float


class BudgetLimitOut(BaseModel):
    id: int
    category_id: int
    monthly_limit: float
    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.get("/", response_model=list[BudgetLimitOut])
def list_limits(db: Session = Depends(get_db)):
    return db.query(BudgetLimit).all()


@router.post("/", response_model=BudgetLimitOut)
def create_or_update_limit(data: BudgetLimitCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).get(data.category_id)
    if not cat:
        raise HTTPException(404, "Categoria non trovata")

    existing = db.query(BudgetLimit).filter(
        BudgetLimit.category_id == data.category_id
    ).first()

    if existing:
        existing.monthly_limit = data.monthly_limit
        db.commit()
        db.refresh(existing)
        return existing

    bl = BudgetLimit(**data.model_dump())
    db.add(bl)
    db.commit()
    db.refresh(bl)
    return bl


@router.delete("/{category_id}", status_code=204)
def delete_limit(category_id: int, db: Session = Depends(get_db)):
    bl = db.query(BudgetLimit).filter(BudgetLimit.category_id == category_id).first()
    if not bl:
        raise HTTPException(404, "Limite non trovato")
    db.delete(bl)
    db.commit()


@router.get("/status/{year}/{month}")
def budget_status(year: int, month: int, db: Session = Depends(get_db)):
    """Per ogni categoria con limite, ritorna: categoria, limite, speso, rimanente, percentuale."""
    limits = db.query(BudgetLimit).all()
    result = []

    for bl in limits:
        cat = db.query(Category).get(bl.category_id)
        if not cat:
            continue

        # Calcola il totale speso (valori negativi = uscite, prendiamo il valore assoluto)
        spent_row = db.query(func.coalesce(func.sum(Transaction.amount), 0.0)).filter(
            Transaction.year == year,
            Transaction.month == month,
            Transaction.category_id == bl.category_id,
        ).scalar()

        # amount negativo = spesa, quindi spent è il valore assoluto
        spent = abs(float(spent_row))
        remaining = bl.monthly_limit - spent
        percentage = round((spent / bl.monthly_limit) * 100, 1) if bl.monthly_limit > 0 else 0.0

        result.append({
            "category_id": bl.category_id,
            "category": cat.name,
            "limit": bl.monthly_limit,
            "spent": spent,
            "remaining": remaining,
            "percentage": percentage,
        })

    return result
