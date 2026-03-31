from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Category, Transaction
from schemas import CategoryOut, CategoryCreate, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.display_order).all()


@router.post("/", response_model=CategoryOut)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    # Check uniqueness
    existing = db.query(Category).filter(Category.name == data.name.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Categoria '{data.name}' esiste già")
    cat = Category(
        name=data.name.upper(),
        type=data.type,
        display_order=data.display_order or 999,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    if data.name is not None:
        # Check name uniqueness (excluding self)
        dup = db.query(Category).filter(
            Category.name == data.name.upper(),
            Category.id != category_id
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Nome '{data.name}' già in uso")
        cat.name = data.name.upper()
    if data.type is not None:
        cat.type = data.type
    if data.display_order is not None:
        cat.display_order = data.display_order
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}")
def delete_category(category_id: int, reassign_to: int = None, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria non trovata")

    # Check if transactions use this category
    tx_count = db.query(Transaction).filter(Transaction.category_id == category_id).count()

    if tx_count > 0:
        if reassign_to is None:
            # Find ALTRO category to reassign to
            altro = db.query(Category).filter(Category.name == "ALTRO").first()
            if altro:
                db.query(Transaction).filter(Transaction.category_id == category_id).update(
                    {"category_id": altro.id}
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Categoria usata da {tx_count} transazioni. Specificare reassign_to o creare ALTRO."
                )
        else:
            target = db.query(Category).filter(Category.id == reassign_to).first()
            if not target:
                raise HTTPException(status_code=404, detail="Categoria destinazione non trovata")
            db.query(Transaction).filter(Transaction.category_id == category_id).update(
                {"category_id": reassign_to}
            )

    db.delete(cat)
    db.commit()
    return {"ok": True, "reassigned": tx_count}
