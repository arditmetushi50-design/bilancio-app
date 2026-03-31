from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Investment
from schemas import InvestmentCreate, InvestmentUpdate, InvestmentOut

router = APIRouter(prefix="/api/investimenti", tags=["investimenti"])


@router.get("/", response_model=list[InvestmentOut])
def get_investimenti(db: Session = Depends(get_db)):
    return db.query(Investment).order_by(Investment.date.desc()).all()


@router.post("/", response_model=InvestmentOut, status_code=201)
def create_investimento(data: InvestmentCreate, db: Session = Depends(get_db)):
    inv = Investment(**data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@router.put("/{inv_id}", response_model=InvestmentOut)
def update_investimento(inv_id: int, data: InvestmentUpdate, db: Session = Depends(get_db)):
    inv = db.query(Investment).get(inv_id)
    if not inv:
        raise HTTPException(404, "Investimento non trovato")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(inv, key, val)
    db.commit()
    db.refresh(inv)
    return inv


@router.delete("/{inv_id}", status_code=204)
def delete_investimento(inv_id: int, db: Session = Depends(get_db)):
    inv = db.query(Investment).get(inv_id)
    if not inv:
        raise HTTPException(404, "Investimento non trovato")
    db.delete(inv)
    db.commit()


@router.get("/riepilogo")
def riepilogo_investimenti(db: Session = Depends(get_db)):
    invs = db.query(Investment).all()
    total_invested = sum(i.amount_invested for i in invs)
    total_current = sum(i.current_value for i in invs if i.current_value is not None)
    by_asset: dict = {}
    for i in invs:
        by_asset.setdefault(i.asset, {"invested": 0.0, "current": 0.0, "count": 0})
        by_asset[i.asset]["invested"] += i.amount_invested
        if i.current_value:
            by_asset[i.asset]["current"] += i.current_value
        by_asset[i.asset]["count"] += 1

    return {
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "rendimento_euro": round(total_current - total_invested, 2) if total_current else None,
        "rendimento_pct": round((total_current - total_invested) / total_invested * 100, 2)
                          if total_invested and total_current else None,
        "by_asset": by_asset,
    }
