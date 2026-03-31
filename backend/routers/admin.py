from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Transaction, Investment, RecurringTransaction, BudgetLimit, CategoryCorrection, CategoryRule
from services.backup import create_backup as do_backup

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset")
def reset_all_data(db: Session = Depends(get_db)):
    """Cancella tutti i dati. Crea automaticamente un backup prima."""
    # 1. Create backup first
    try:
        backup_info = do_backup()
    except Exception as e:
        backup_info = {"error": str(e)}

    # 2. Delete all transaction data
    db.query(Transaction).delete()
    db.query(Investment).delete()
    db.query(RecurringTransaction).delete()
    db.query(BudgetLimit).delete()
    db.query(CategoryCorrection).delete()
    db.query(CategoryRule).delete()
    db.commit()

    return {
        "ok": True,
        "message": "Tutti i dati sono stati cancellati",
        "backup": backup_info,
    }
