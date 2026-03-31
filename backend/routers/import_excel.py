import os
import shutil
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from services.excel_importer import import_excel

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/excel")
async def import_excel_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Solo file .xlsx supportati")

    tmp_path = os.path.join(UPLOAD_DIR, f"import_{file.filename}")
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        result = import_excel(tmp_path, db)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(500, f"Errore importazione: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
