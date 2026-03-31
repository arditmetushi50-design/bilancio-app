"""
Sistema di backup per il database bilancio.db.
"""
import os
import shutil
from datetime import datetime
from pathlib import Path

# Percorsi relativi alla directory backend
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "bilancio.db"
BACKUP_DIR = BASE_DIR / "backups"

MAX_BACKUPS = 10


def create_backup() -> dict:
    """Crea un backup del database con timestamp."""
    BACKUP_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    filename = f"bilancio_{timestamp}.db"
    dest = BACKUP_DIR / filename

    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database non trovato: {DB_PATH}")

    shutil.copy2(str(DB_PATH), str(dest))

    # Auto-cleanup: mantieni solo gli ultimi MAX_BACKUPS
    _cleanup_old_backups()

    return {"filename": filename, "path": str(dest), "size_kb": round(dest.stat().st_size / 1024, 1)}


def list_backups() -> list[dict]:
    """Restituisce la lista dei backup disponibili."""
    if not BACKUP_DIR.exists():
        return []

    backups = []
    for f in sorted(BACKUP_DIR.glob("bilancio_*.db"), reverse=True):
        backups.append({
            "filename": f.name,
            "size_kb": round(f.stat().st_size / 1024, 1),
            "created": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })
    return backups


def restore_backup(filename: str) -> dict:
    """Ripristina un backup specifico sovrascrivendo il database corrente."""
    src = BACKUP_DIR / filename
    if not src.exists():
        raise FileNotFoundError(f"Backup non trovato: {filename}")

    # Crea un backup di sicurezza prima del ripristino
    safety_backup = BACKUP_DIR / f"bilancio_pre_restore_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.db"
    BACKUP_DIR.mkdir(exist_ok=True)
    if DB_PATH.exists():
        shutil.copy2(str(DB_PATH), str(safety_backup))

    shutil.copy2(str(src), str(DB_PATH))
    return {"restored_from": filename, "safety_backup": safety_backup.name}


def _cleanup_old_backups():
    """Mantiene solo gli ultimi MAX_BACKUPS backup."""
    if not BACKUP_DIR.exists():
        return
    backups = sorted(BACKUP_DIR.glob("bilancio_*.db"), key=lambda f: f.stat().st_mtime, reverse=True)
    for old in backups[MAX_BACKUPS:]:
        old.unlink()
