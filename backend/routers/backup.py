from fastapi import APIRouter, HTTPException
from services.backup import create_backup, list_backups, restore_backup

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.post("/create")
def api_create_backup():
    try:
        result = create_backup()
        return result
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.get("/list")
def api_list_backups():
    return list_backups()


@router.post("/restore/{filename}")
def api_restore_backup(filename: str):
    try:
        result = restore_backup(filename)
        return result
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
