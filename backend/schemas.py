from typing import Optional
from pydantic import BaseModel


class CategoryOut(BaseModel):
    id: int
    name: str
    type: str
    display_order: int

    model_config = {"from_attributes": True}


class TransactionBase(BaseModel):
    year: int
    month: int
    category_id: int
    description: str
    amount: float


class TransactionCreate(TransactionBase):
    source: Optional[str] = "manual"
    ocr_raw_text: Optional[str] = None
    ocr_confidence: Optional[float] = None
    ocr_proposed_category: Optional[str] = None
    force: Optional[bool] = False  # bypass duplicate check


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    year: Optional[int] = None
    month: Optional[int] = None


class TransactionOut(TransactionBase):
    id: int
    source: str
    ocr_raw_text: Optional[str] = None
    ocr_confidence: Optional[float] = None
    ocr_proposed_category: Optional[str] = None
    category: CategoryOut

    model_config = {"from_attributes": True}


class InvestmentBase(BaseModel):
    date: str
    asset: str
    asset_type: str
    amount_invested: float
    current_value: Optional[float] = None
    notes: Optional[str] = None


class InvestmentCreate(InvestmentBase):
    pass


class InvestmentUpdate(BaseModel):
    date: Optional[str] = None
    asset: Optional[str] = None
    asset_type: Optional[str] = None
    amount_invested: Optional[float] = None
    current_value: Optional[float] = None
    notes: Optional[str] = None


class InvestmentOut(InvestmentBase):
    id: int
    model_config = {"from_attributes": True}


class MonthSummary(BaseModel):
    year: int
    month: int
    total_entrate: float
    total_uscite: float
    risparmio: float
    spese_fisse: float
    by_category: dict


class YearSummary(BaseModel):
    year: int
    months: list[MonthSummary]
    total_entrate: float
    total_uscite: float
    risparmio: float


class OcrResult(BaseModel):
    raw_text: str
    amount: Optional[float]
    description: Optional[str]
    date_hint: Optional[str]
    proposed_category: Optional[str]
    confidence: float
    year_hint: Optional[int]
    month_hint: Optional[int]


class CategoryCreate(BaseModel):
    name: str
    type: str  # SPESA_FISSA | SPESA_VARIABILE | ENTRATA | INVESTIMENTO
    display_order: Optional[int] = 999

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    display_order: Optional[int] = None
