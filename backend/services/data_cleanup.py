"""
Trova e rimuove transazioni duplicate esatte.
Mantiene la più vecchia (id più basso) di ogni gruppo duplicato.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from models import Transaction


def cleanup_duplicates(db: Session) -> dict:
    """
    Trova duplicati esatti (same year, month, category_id, description, amount).
    Mantiene solo il record con id più basso per ogni gruppo.
    Ritorna un report di cosa è stato pulito.
    """
    # Trova gruppi duplicati
    subq = (
        db.query(
            Transaction.year,
            Transaction.month,
            Transaction.category_id,
            Transaction.description,
            Transaction.amount,
            func.min(Transaction.id).label("keep_id"),
            func.count(Transaction.id).label("cnt"),
        )
        .group_by(
            Transaction.year,
            Transaction.month,
            Transaction.category_id,
            Transaction.description,
            Transaction.amount,
        )
        .having(func.count(Transaction.id) > 1)
        .all()
    )

    deleted_count = 0
    deleted_details = []

    for row in subq:
        keep_id = row.keep_id
        # Trova tutti i duplicati di questo gruppo tranne quello da tenere
        duplicates = (
            db.query(Transaction)
            .filter(
                Transaction.year == row.year,
                Transaction.month == row.month,
                Transaction.category_id == row.category_id,
                Transaction.description == row.description,
                Transaction.amount == row.amount,
                Transaction.id != keep_id,
            )
            .all()
        )

        for dup in duplicates:
            deleted_details.append({
                "id": dup.id,
                "year": dup.year,
                "month": dup.month,
                "description": dup.description,
                "amount": dup.amount,
            })
            db.delete(dup)
            deleted_count += 1

    if deleted_count > 0:
        db.commit()

    return {
        "duplicates_found": len(subq),
        "records_deleted": deleted_count,
        "details": deleted_details,
    }
