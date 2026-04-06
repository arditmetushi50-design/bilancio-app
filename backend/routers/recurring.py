import re
from collections import defaultdict
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import RecurringTransaction, Transaction, Category, DismissedSuggestion

router = APIRouter(prefix="/api/recurring", tags=["recurring"])

SUBSCRIPTION_KEYWORDS = {
    "netflix", "spotify", "amazon prime", "disney", "apple", "google",
    "youtube premium", "hbo", "sky", "dazn", "paramount", "adobe",
    "microsoft 365", "icloud", "dropbox", "notion", "claude", "chatgpt",
    "openai", "canva", "figma", "github", "audible", "kindle"
}

MESI_IT = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
           "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]

# ── Schemas ──────────────────────────────────────────────────────────────────

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_desc(desc: str) -> str:
    d = re.sub(r'^\d{1,2}[_\-\s]', '', desc.strip())
    d = re.sub(r'\s+', ' ', d.lower().strip())
    return d

def _frequency_label(gap_months: int) -> str:
    if gap_months <= 1:   return "mensile"
    if gap_months == 2:   return "bimestrale"
    if gap_months == 3:   return "trimestrale"
    if gap_months == 6:   return "semestrale"
    if gap_months >= 11:  return "annuale"
    return "irregolare"

def _next_expected(months_seen: list[tuple[int,int]], gap: int) -> tuple[int,int]:
    last = max(months_seen, key=lambda x: x[0]*12 + x[1])
    n = last[0]*12 + last[1] + gap
    return ((n - 1) // 12, (n - 1) % 12 + 1)

def _is_subscription(norm_desc: str, cat_name: str) -> bool:
    if cat_name.upper() == "NETFLIX":
        return True
    return any(kw in norm_desc for kw in SUBSCRIPTION_KEYWORDS)

def _avg_monthly_income(db: Session, year: int, month: int, lookback: int = 6) -> float:
    cutoff = year * 12 + month - lookback
    rows = db.query(
        Transaction.year, Transaction.month,
        func.sum(Transaction.amount).label("total")
    ).filter(
        Transaction.amount > 0,
        (Transaction.year * 12 + Transaction.month) >= cutoff,
        (Transaction.year * 12 + Transaction.month) < (year * 12 + month),
    ).group_by(Transaction.year, Transaction.month).all()
    if not rows:
        return 0.0
    return sum(r.total for r in rows) / len(rows)

def _ym_label(y: int, m: int) -> str:
    return f"{MESI_IT[m]} {y}"

def _similar_merchant(a: str, b: str) -> bool:
    """Check if two normalized descriptions are likely the same merchant."""
    if a == b:
        return False
    if not a or not b:
        return False
    # One contains the other
    if a in b or b in a:
        return True
    # Levenshtein-like: same start (at least 5 chars matching)
    min_len = min(len(a), len(b))
    if min_len >= 5:
        common = 0
        for ca, cb in zip(a, b):
            if ca == cb:
                common += 1
            else:
                break
        if common >= 5 and common >= min_len * 0.7:
            return True
    return False


# ── CRUD ─────────────────────────────────────────────────────────────────────

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
        raise HTTPException(404)
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(rec, key, val)
    db.commit()
    db.refresh(rec)
    return rec

@router.delete("/{rec_id}", status_code=204)
def delete_recurring(rec_id: int, db: Session = Depends(get_db)):
    rec = db.query(RecurringTransaction).get(rec_id)
    if not rec:
        raise HTTPException(404)
    db.delete(rec)
    db.commit()

@router.post("/apply/{year}/{month}")
def apply_recurring(year: int, month: int, db: Session = Depends(get_db)):
    active_recs = db.query(RecurringTransaction).filter(RecurringTransaction.active == True).all()
    created, skipped = [], []
    for rec in active_recs:
        exists = db.query(Transaction).filter(
            Transaction.year == year, Transaction.month == month,
            Transaction.category_id == rec.category_id,
            Transaction.description == rec.description,
            Transaction.amount == rec.amount,
        ).first()
        if exists:
            skipped.append(rec.description)
            continue
        db.add(Transaction(
            year=year, month=month, category_id=rec.category_id,
            description=rec.description, amount=rec.amount, source="recurring",
        ))
        created.append(rec.description)
    db.commit()
    return {"created": created, "skipped": skipped}


# ── DISMISSED SUGGESTIONS ────────────────────────────────────────────────────

@router.post("/dismiss")
def dismiss_suggestion(data: dict, db: Session = Depends(get_db)):
    norm = data.get("normalized_description", "")
    cat_id = data.get("category_id", 0)
    if not norm and not cat_id:
        raise HTTPException(400, "normalized_description e category_id richiesti")
    exists = db.query(DismissedSuggestion).filter(
        DismissedSuggestion.normalized_description == norm,
        DismissedSuggestion.category_id == cat_id,
    ).first()
    if not exists:
        db.add(DismissedSuggestion(normalized_description=norm, category_id=cat_id))
        db.commit()
    return {"ok": True}

@router.post("/undismiss")
def undismiss_suggestion(data: dict, db: Session = Depends(get_db)):
    norm = data.get("normalized_description", "")
    cat_id = data.get("category_id", 0)
    d = db.query(DismissedSuggestion).filter(
        DismissedSuggestion.normalized_description == norm,
        DismissedSuggestion.category_id == cat_id,
    ).first()
    if d:
        db.delete(d)
        db.commit()
    return {"ok": True}


# ── SUGGESTIONS (enhanced) ───────────────────────────────────────────────────

@router.get("/suggestions")
def get_suggestions(db: Session = Depends(get_db)):
    transactions = db.query(Transaction).all()
    existing = db.query(RecurringTransaction).all()
    dismissed = db.query(DismissedSuggestion).all()
    already_added = {_normalize_desc(r.description) for r in existing}
    dismissed_set = {(d.normalized_description, d.category_id) for d in dismissed}

    groups: dict = defaultdict(list)
    for t in transactions:
        groups[(_normalize_desc(t.description), t.category_id)].append(t)

    suggestions = []
    for (norm_desc, cat_id), txs in groups.items():
        months_seen = sorted(set((t.year, t.month) for t in txs), key=lambda x: x[0]*12+x[1])
        if len(months_seen) < 3:
            continue

        amounts = [abs(t.amount) for t in txs]
        avg_amount = sum(amounts) / len(amounts)
        min_amount = min(amounts)
        max_amount = max(amounts)
        sign = -1 if txs[0].amount < 0 else 1

        # Frequency
        all_ym = [ym[0]*12+ym[1] for ym in months_seen]
        span = all_ym[-1] - all_ym[0] + 1
        gaps = [all_ym[i]-all_ym[i-1] for i in range(1, len(all_ym))]
        median_gap = sorted(gaps)[len(gaps)//2] if gaps else 1
        consistency = len(months_seen) / max(1, span)
        amount_variation = max_amount / min_amount if min_amount > 0 else 99

        if consistency >= 0.7 and amount_variation <= 1.15:
            confidence, conf_score = "alto", 3
        elif consistency >= 0.45 or (len(months_seen) >= 5 and amount_variation <= 1.5):
            confidence, conf_score = "medio", 2
        else:
            confidence, conf_score = "basso", 1

        cat = db.query(Category).get(cat_id)
        cat_name = cat.name if cat else "—"

        next_y, next_m = _next_expected(months_seen, median_gap)
        annualized = abs(avg_amount) * (12 / max(1, median_gap))

        # By-year avg
        by_year: dict = {}
        for t in txs:
            by_year.setdefault(t.year, []).append(abs(t.amount))
        yearly_avg = {str(y): round(sum(v)/len(v), 2) for y, v in sorted(by_year.items())}

        years_seen = sorted(set(t.year for t in txs))

        # Last seen month
        last_seen = months_seen[-1]
        last_seen_label = _ym_label(last_seen[0], last_seen[1])

        # Months list for frontend
        months_list = [{"year": ym[0], "month": ym[1], "label": _ym_label(ym[0], ym[1])} for ym in months_seen]

        suggestions.append({
            "description": txs[0].description,
            "normalized_description": norm_desc,
            "category_id": cat_id,
            "category_name": cat_name,
            "category_type": cat.type if cat else "SPESA_VARIABILE",
            "avg_amount": round(avg_amount * sign, 2),
            "min_amount": round(min_amount, 2),
            "max_amount": round(max_amount, 2),
            "amount_variation": round(amount_variation, 2),
            "months_count": len(months_seen),
            "span_months": span,
            "consistency": round(consistency, 2),
            "confidence": confidence,
            "confidence_score": conf_score,
            "already_added": norm_desc in already_added,
            "is_dismissed": (norm_desc, cat_id) in dismissed_set,
            "years_seen": years_seen,
            "yearly_avg": yearly_avg,
            "frequency_months": median_gap,
            "frequency_label": _frequency_label(median_gap),
            "next_expected_year": next_y,
            "next_expected_month": next_m,
            "next_expected_label": f"{MESI_IT[next_m]} {next_y}",
            "annualized_cost": round(annualized, 2),
            "is_subscription": _is_subscription(norm_desc, cat_name),
            "last_year": years_seen[-1] if years_seen else None,
            "last_seen_label": last_seen_label,
            "months_list": months_list,
        })

    suggestions.sort(key=lambda x: (-x["confidence_score"], -x["months_count"]))
    return suggestions


# ── FORECAST (multi-month) ───────────────────────────────────────────────────

@router.get("/forecast/{year}/{month}")
def get_forecast(year: int, month: int, months_ahead: int = 0, db: Session = Depends(get_db)):
    """
    months_ahead=0: current month only.
    months_ahead=1: current + next month.
    months_ahead=2: current + 2 months ahead (90 days).
    """
    confirmed = db.query(RecurringTransaction).filter(RecurringTransaction.active == True).all()

    # Build forecast for each month in range
    months_data = []
    for offset in range(months_ahead + 1):
        ym = year * 12 + month - 1 + offset
        m_year = ym // 12
        m_month = ym % 12 + 1

        current_txs = db.query(Transaction).filter(
            Transaction.year == m_year, Transaction.month == m_month
        ).all()

        total_income_now  = sum(t.amount for t in current_txs if t.amount > 0)
        total_expense_now = sum(t.amount for t in current_txs if t.amount < 0)

        appeared, still_expected = [], []
        for rec in confirmed:
            cat = db.query(Category).get(rec.category_id)
            norm = _normalize_desc(rec.description)
            found = any(
                _normalize_desc(t.description) == norm and t.category_id == rec.category_id
                for t in current_txs
            )
            item = {
                "id": rec.id,
                "description": rec.description,
                "category_name": cat.name if cat else "—",
                "amount": rec.amount,
                "is_income": rec.amount > 0,
            }
            (appeared if found else still_expected).append(item)

        exp_expense = sum(r["amount"] for r in still_expected if r["amount"] < 0)
        exp_income  = sum(r["amount"] for r in still_expected if r["amount"] > 0)
        forecast_bal = total_income_now + total_expense_now + exp_expense + exp_income

        months_data.append({
            "year": m_year,
            "month": m_month,
            "label": _ym_label(m_year, m_month),
            "appeared": appeared,
            "still_expected": still_expected,
            "appeared_count": len(appeared),
            "still_expected_count": len(still_expected),
            "total_income_now": round(total_income_now, 2),
            "total_expense_now": round(total_expense_now, 2),
            "expected_expenses_remaining": round(exp_expense, 2),
            "expected_income_remaining": round(exp_income, 2),
            "forecast_balance": round(forecast_bal, 2),
        })

    # Global KPIs for current month (first entry)
    fixed_monthly = sum(abs(r.amount) for r in confirmed if r.amount < 0)
    income_monthly = sum(r.amount for r in confirmed if r.amount > 0)
    avg_inc = _avg_monthly_income(db, year, month)
    burden_pct = round(fixed_monthly / avg_inc * 100, 1) if avg_inc > 0 else 0

    current = months_data[0] if months_data else {}

    return {
        # Current month (backwards-compatible)
        "appeared": current.get("appeared", []),
        "still_expected": current.get("still_expected", []),
        "appeared_count": current.get("appeared_count", 0),
        "still_expected_count": current.get("still_expected_count", 0),
        "total_income_now": current.get("total_income_now", 0),
        "total_expense_now": current.get("total_expense_now", 0),
        "expected_expenses_remaining": current.get("expected_expenses_remaining", 0),
        "expected_income_remaining": current.get("expected_income_remaining", 0),
        "forecast_balance": current.get("forecast_balance", 0),
        "fixed_monthly_cost": round(fixed_monthly, 2),
        "income_monthly_recurring": round(income_monthly, 2),
        "burden_pct": burden_pct,
        "avg_monthly_income": round(avg_inc, 2),
        # Multi-month data
        "months": months_data,
    }


# ── ANOMALIES ────────────────────────────────────────────────────────────────

@router.get("/anomalies/{year}/{month}")
def get_anomalies(year: int, month: int, db: Session = Depends(get_db)):
    """Detect anomalies: disappeared, duplicates, similar merchants, amount spikes."""
    confirmed = db.query(RecurringTransaction).filter(RecurringTransaction.active == True).all()
    all_txs = db.query(Transaction).all()
    anomalies = []

    groups: dict = defaultdict(list)
    for t in all_txs:
        groups[(_normalize_desc(t.description), t.category_id)].append(t)

    current_ym = year * 12 + month

    # 1. Disappeared: confirmed recurring that hasn't appeared for 2+ months
    for rec in confirmed:
        norm = _normalize_desc(rec.description)
        key = (norm, rec.category_id)
        txs = groups.get(key, [])
        if not txs:
            continue
        months_seen = sorted(set((t.year, t.month) for t in txs), key=lambda x: x[0]*12+x[1])
        last = months_seen[-1]
        last_ym = last[0] * 12 + last[1]
        gap = current_ym - last_ym
        if gap >= 2:
            anomalies.append({
                "type": "disappeared",
                "severity": "warning" if gap >= 3 else "info",
                "icon": "👻",
                "description": rec.description,
                "category_name": db.query(Category).get(rec.category_id).name if db.query(Category).get(rec.category_id) else "—",
                "text": f"'{rec.description}' non appare da {gap} mesi (ultimo: {_ym_label(last[0], last[1])})",
                "detail": {"last_seen": _ym_label(last[0], last[1]), "months_missing": gap},
            })

    # 2. Amount spike: current amount significantly different from historical avg
    for rec in confirmed:
        norm = _normalize_desc(rec.description)
        key = (norm, rec.category_id)
        txs = groups.get(key, [])
        hist_amounts = [abs(t.amount) for t in txs if not (t.year == year and t.month == month)]
        if len(hist_amounts) >= 3:
            hist_avg = sum(hist_amounts) / len(hist_amounts)
            hist_min = min(hist_amounts)
            hist_max = max(hist_amounts)
            if hist_avg > 0 and abs(rec.amount) > hist_avg * 1.25:
                pct = ((abs(rec.amount) - hist_avg) / hist_avg) * 100
                anomalies.append({
                    "type": "amount_spike",
                    "severity": "warning",
                    "icon": "📈",
                    "description": rec.description,
                    "category_name": db.query(Category).get(rec.category_id).name if db.query(Category).get(rec.category_id) else "—",
                    "text": f"'{rec.description}' impostato a {abs(rec.amount):.2f}€ — è il {pct:.0f}% sopra la media storica ({hist_avg:.2f}€)",
                    "detail": {"current": abs(rec.amount), "avg": round(hist_avg, 2), "min": round(hist_min, 2), "max": round(hist_max, 2)},
                })

    # 3. Duplicates: two confirmed recurring that match the same normalized description
    seen_norms: dict = {}
    for rec in confirmed:
        norm = _normalize_desc(rec.description)
        key = (norm, rec.category_id)
        if key in seen_norms:
            anomalies.append({
                "type": "duplicate",
                "severity": "warning",
                "icon": "🔄",
                "description": rec.description,
                "category_name": db.query(Category).get(rec.category_id).name if db.query(Category).get(rec.category_id) else "—",
                "text": f"'{rec.description}' sembra duplicato (stesso nome normalizzato di '{seen_norms[key]}')",
                "detail": {"duplicate_of": seen_norms[key]},
            })
        else:
            seen_norms[key] = rec.description

    # 4. Similar merchants: confirmed items with very similar descriptions
    norms_list = [(rec, _normalize_desc(rec.description)) for rec in confirmed]
    checked_pairs: set = set()
    for i, (rec_a, norm_a) in enumerate(norms_list):
        for j, (rec_b, norm_b) in enumerate(norms_list):
            if i >= j:
                continue
            pair_key = (min(norm_a, norm_b), max(norm_a, norm_b))
            if pair_key in checked_pairs:
                continue
            checked_pairs.add(pair_key)
            if rec_a.category_id == rec_b.category_id and _similar_merchant(norm_a, norm_b):
                anomalies.append({
                    "type": "similar_merchant",
                    "severity": "info",
                    "icon": "🔍",
                    "description": rec_a.description,
                    "category_name": db.query(Category).get(rec_a.category_id).name if db.query(Category).get(rec_a.category_id) else "—",
                    "text": f"'{rec_a.description}' e '{rec_b.description}' sembrano lo stesso merchant",
                    "detail": {"other": rec_b.description},
                })

    return anomalies


# ── INSIGHTS (enhanced) ──────────────────────────────────────────────────────

@router.get("/insights/{year}/{month}")
def get_insights(year: int, month: int, db: Session = Depends(get_db)):
    confirmed = db.query(RecurringTransaction).filter(RecurringTransaction.active == True).all()
    all_txs  = db.query(Transaction).all()
    curr_txs = [t for t in all_txs if t.year == year and t.month == month]

    insights = []
    current_ym = year * 12 + month

    groups: dict = defaultdict(list)
    for t in all_txs:
        groups[(_normalize_desc(t.description), t.category_id)].append(t)

    # — Saldo previsto —
    total_now = sum(t.amount for t in curr_txs)
    still_expected_total = 0
    still_count = 0
    for rec in confirmed:
        norm = _normalize_desc(rec.description)
        if not any(_normalize_desc(t.description) == norm and t.category_id == rec.category_id for t in curr_txs):
            still_expected_total += rec.amount
            still_count += 1
    forecast_bal = total_now + still_expected_total

    if still_count > 0:
        tot_exp = sum(abs(rec.amount) for rec in confirmed if rec.amount < 0
                      if not any(_normalize_desc(t.description) == _normalize_desc(rec.description)
                                 and t.category_id == rec.category_id for t in curr_txs))
        insights.append({
            "icon": "📅", "type": "upcoming", "severity": "info",
            "text": f"Questo mese ti restano ancora {still_count} ricorrent{'e' if still_count==1 else 'i'} "
                    f"per un totale stimato di {tot_exp:,.0f} €".replace(",", ".")
        })

    # — Saldo previsto fine mese —
    insights.append({
        "icon": "🎯", "type": "forecast_balance", "severity": "success" if forecast_bal >= 0 else "warning",
        "text": f"Il saldo previsto a fine {MESI_IT[month]} è di {forecast_bal:,.0f} € "
                f"({'positivo ✓' if forecast_bal >= 0 else 'negativo ⚠'})".replace(",", ".")
    })

    # — Burden —
    avg_inc = _avg_monthly_income(db, year, month)
    fixed   = sum(abs(r.amount) for r in confirmed if r.amount < 0)
    if avg_inc > 0 and fixed > 0:
        pct = fixed / avg_inc * 100
        if pct > 60:
            insights.append({
                "icon": "⚠️", "type": "burden", "severity": "warning",
                "text": f"Le spese fisse assorbono il {pct:.0f}% delle entrate medie — alto impatto sul cashflow"
            })
        else:
            insights.append({
                "icon": "💡", "type": "burden", "severity": "info",
                "text": f"Le spese ricorrenti fisse pesano il {pct:.0f}% delle entrate medie mensili"
            })

    # — Amount changes vs historical avg —
    for rec in confirmed:
        norm = _normalize_desc(rec.description)
        hist = [abs(t.amount) for t in all_txs
                if _normalize_desc(t.description) == norm
                and t.category_id == rec.category_id
                and not (t.year == year and t.month == month)]
        if len(hist) >= 3:
            hist_avg = sum(hist) / len(hist)
            if hist_avg > 0 and abs(rec.amount) > hist_avg * 1.2:
                delta_pct = ((abs(rec.amount) - hist_avg) / hist_avg) * 100
                insights.append({
                    "icon": "📈", "type": "increase", "severity": "warning",
                    "text": f"'{rec.description}' è superiore del {delta_pct:.0f}% rispetto alla media storica"
                })

    # — Disappeared recurring —
    for rec in confirmed:
        norm = _normalize_desc(rec.description)
        key = (norm, rec.category_id)
        txs = groups.get(key, [])
        if txs:
            months_seen = sorted(set((t.year, t.month) for t in txs), key=lambda x: x[0]*12+x[1])
            last = months_seen[-1]
            last_ym = last[0] * 12 + last[1]
            gap = current_ym - last_ym
            if gap >= 3:
                insights.append({
                    "icon": "👻", "type": "disappeared", "severity": "warning",
                    "text": f"'{rec.description}' non appare da {gap} mesi — è ancora attivo?"
                })

    # — New subscription detected (from suggestions, not confirmed yet) —
    existing_norms = {_normalize_desc(r.description) for r in confirmed}
    for (norm_desc, cat_id), txs in groups.items():
        if norm_desc in existing_norms:
            continue
        months_seen = sorted(set((t.year, t.month) for t in txs), key=lambda x: x[0]*12+x[1])
        if len(months_seen) < 3:
            continue
        cat = db.query(Category).get(cat_id)
        cat_name = cat.name if cat else ""
        if _is_subscription(norm_desc, cat_name):
            # Only if recent (appeared in last 3 months)
            last = months_seen[-1]
            if current_ym - (last[0]*12 + last[1]) <= 3:
                insights.append({
                    "icon": "🆕", "type": "new_subscription", "severity": "info",
                    "text": f"'{txs[0].description}' sembra un nuovo abbonamento ricorrente — vuoi aggiungerlo?"
                })

    # — Subscriptions total —
    subs = []
    for r in confirmed:
        cat = db.query(Category).get(r.category_id)
        cname = cat.name if cat else ""
        if _is_subscription(_normalize_desc(r.description), cname):
            subs.append(r)
    if subs:
        tot_subs = sum(abs(r.amount) for r in subs if r.amount < 0)
        annual   = tot_subs * 12
        insights.append({
            "icon": "📱", "type": "subscriptions", "severity": "info",
            "text": f"Hai {len(subs)} abbonament{'o' if len(subs)==1 else 'i'} attiv{'o' if len(subs)==1 else 'i'}: "
                    f"{tot_subs:.0f} €/mese · {annual:.0f} €/anno"
        })

    # — Utility comparison: current month vs 6-month avg by category —
    utility_cats = {"GAS", "LUCE", "ACQUA", "VODAFONE"}
    for cat_name_check in utility_cats:
        cat_obj = db.query(Category).filter(Category.name == cat_name_check).first()
        if not cat_obj:
            continue
        curr_total = sum(abs(t.amount) for t in curr_txs if t.category_id == cat_obj.id and t.amount < 0)
        if curr_total == 0:
            continue
        lookback_months = 6
        cutoff_ym = current_ym - lookback_months
        hist_totals = []
        for ym_val in range(cutoff_ym, current_ym):
            ym_y = ym_val // 12 if ym_val % 12 != 0 else (ym_val // 12) - 1
            ym_m = ym_val % 12 if ym_val % 12 != 0 else 12
            # Fix: use proper year/month from the 1-indexed system
            ym_y_fixed = (ym_val - 1) // 12
            ym_m_fixed = (ym_val - 1) % 12 + 1
            month_total = sum(abs(t.amount) for t in all_txs
                              if t.year == ym_y_fixed and t.month == ym_m_fixed
                              and t.category_id == cat_obj.id and t.amount < 0)
            if month_total > 0:
                hist_totals.append(month_total)
        if len(hist_totals) >= 2:
            hist_avg = sum(hist_totals) / len(hist_totals)
            if hist_avg > 0 and curr_total > hist_avg * 1.15:
                pct_over = ((curr_total - hist_avg) / hist_avg) * 100
                insights.append({
                    "icon": "⚡", "type": "utility_spike", "severity": "warning",
                    "text": f"Le utenze {cat_name_check} di {MESI_IT[month]} ({curr_total:.0f}€) sono il {pct_over:.0f}% sopra la media degli ultimi 6 mesi ({hist_avg:.0f}€)"
                })

    # — Stable recurring (high confidence) —
    stable_names = []
    for rec in confirmed:
        norm = _normalize_desc(rec.description)
        key  = (norm, rec.category_id)
        txs  = groups.get(key, [])
        months = set((t.year, t.month) for t in txs)
        if len(months) >= 8:
            stable_names.append(rec.description)

    if stable_names:
        names_str = ", ".join(stable_names[:3])
        extra = f" e altri {len(stable_names)-3}" if len(stable_names) > 3 else ""
        insights.append({
            "icon": "✅", "type": "stable", "severity": "success",
            "text": f"{names_str}{extra} sono stabili da almeno 8 mesi"
        })

    return insights


# ── HISTORY ───────────────────────────────────────────────────────────────────

@router.get("/history")
def get_history(db: Session = Depends(get_db)):
    recurring = db.query(RecurringTransaction).filter(RecurringTransaction.active == True).all()
    transactions = db.query(Transaction).all()
    result = []
    for rec in recurring:
        norm = _normalize_desc(rec.description)
        cat  = db.query(Category).get(rec.category_id)
        matching = [t for t in transactions
                    if _normalize_desc(t.description) == norm and t.category_id == rec.category_id]
        by_year: dict = {}
        by_month: dict = {}
        for t in matching:
            by_year.setdefault(t.year, {"total": 0.0, "count": 0})
            by_year[t.year]["total"] += abs(t.amount)
            by_year[t.year]["count"] += 1
            ym_key = f"{t.year}-{t.month:02d}"
            by_month.setdefault(ym_key, {"total": 0.0, "count": 0, "year": t.year, "month": t.month})
            by_month[ym_key]["total"] += abs(t.amount)
            by_month[ym_key]["count"] += 1

        yearly = {str(y): {"total": round(d["total"],2), "count": d["count"],
                            "avg": round(d["total"]/d["count"],2)}
                  for y, d in sorted(by_year.items())}
        monthly = [{"period": k, "year": v["year"], "month": v["month"],
                     "total": round(v["total"], 2), "label": _ym_label(v["year"], v["month"])}
                    for k, v in sorted(by_month.items())]

        result.append({
            "id": rec.id, "description": rec.description,
            "category_name": cat.name if cat else "—",
            "amount": rec.amount, "yearly": yearly,
            "monthly": monthly,
        })
    return result
