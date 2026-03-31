from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Transaction, Category
from schemas import MonthSummary, YearSummary

router = APIRouter(prefix="/api/riepilogo", tags=["riepilogo"])

MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
        "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]


def _calc_month(db: Session, year: int, month: int) -> MonthSummary:
    transactions = (
        db.query(Transaction)
        .filter(Transaction.year == year, Transaction.month == month)
        .all()
    )

    total_entrate = sum(t.amount for t in transactions if t.amount > 0)
    total_uscite = sum(t.amount for t in transactions if t.amount < 0)
    risparmio = total_entrate + total_uscite  # uscite già negative

    # Spese fisse
    fisse_cats = db.query(Category).filter(Category.type == "SPESA_FISSA").all()
    fisse_ids = {c.id for c in fisse_cats}
    spese_fisse = sum(t.amount for t in transactions if t.category_id in fisse_ids)

    # Per categoria
    by_category: dict = {}
    for t in transactions:
        cat = t.category
        key = cat.name if cat else "ALTRO"
        by_category.setdefault(key, 0.0)
        by_category[key] += t.amount

    return MonthSummary(
        year=year,
        month=month,
        total_entrate=round(total_entrate, 2),
        total_uscite=round(total_uscite, 2),
        risparmio=round(risparmio, 2),
        spese_fisse=round(spese_fisse, 2),
        by_category={k: round(v, 2) for k, v in by_category.items()},
    )


@router.get("/anni", response_model=list[int])
def get_anni(db: Session = Depends(get_db)):
    rows = db.query(Transaction.year).distinct().order_by(Transaction.year).all()
    return [r[0] for r in rows]


@router.get("/{year}", response_model=YearSummary)
def get_year_summary(year: int, db: Session = Depends(get_db)):
    months = []
    for m in range(1, 13):
        months.append(_calc_month(db, year, m))

    total_entrate = sum(ms.total_entrate for ms in months)
    total_uscite = sum(ms.total_uscite for ms in months)
    risparmio = total_entrate + total_uscite

    return YearSummary(
        year=year,
        months=months,
        total_entrate=round(total_entrate, 2),
        total_uscite=round(total_uscite, 2),
        risparmio=round(risparmio, 2),
    )


@router.get("/{year}/{month}", response_model=MonthSummary)
def get_month_summary(year: int, month: int, db: Session = Depends(get_db)):
    return _calc_month(db, year, month)
