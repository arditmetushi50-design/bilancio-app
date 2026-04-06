from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean, func
from sqlalchemy.orm import relationship
from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    # SPESA_FISSA | SPESA_VARIABILE | ENTRATA | INVESTIMENTO
    type = Column(String, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)

    transactions = relationship("Transaction", back_populates="category")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)  # 1-12
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False)  # negativo=uscita, positivo=entrata

    # tracing
    source = Column(String, default="manual")  # manual | ocr | excel_import
    ocr_raw_text = Column(Text, nullable=True)
    ocr_confidence = Column(Float, nullable=True)
    ocr_proposed_category = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category", back_populates="transactions")


class Investment(Base):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False)       # ISO date string
    asset = Column(String, nullable=False)       # Binance, Crypto.com, Scalable...
    asset_type = Column(String, nullable=False)  # Crypto | ETF | Altro
    amount_invested = Column(Float, nullable=False)
    current_value = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CategoryRule(Base):
    """Regole keyword→categoria per classificazione automatica."""
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String, nullable=False, index=True)
    category_name = Column(String, nullable=False)
    priority = Column(Integer, default=0)  # più alto = priorità maggiore


class CategoryCorrection(Base):
    """Apprendimento dalle correzioni utente."""
    __tablename__ = "category_corrections"

    id = Column(Integer, primary_key=True, index=True)
    description_normalized = Column(String, nullable=False, index=True)
    proposed_category = Column(String, nullable=True)
    final_category = Column(String, nullable=False)
    correction_count = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class RecurringTransaction(Base):
    __tablename__ = "recurring_transactions"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    day_of_month = Column(Integer, default=1)  # giorno del mese
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())


class DismissedSuggestion(Base):
    __tablename__ = "dismissed_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    normalized_description = Column(String, nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    created_at = Column(DateTime, default=func.now())


class BudgetLimit(Base):
    __tablename__ = "budget_limits"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False, unique=True)
    monthly_limit = Column(Float, nullable=False)
    created_at = Column(DateTime, default=func.now())
