import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, SessionLocal
from models import Base
from services.seed_db import seed
from services.data_cleanup import cleanup_duplicates
from routers import categories, movimenti, riepilogo, ocr, import_excel, investimenti
from routers import backup, recurring, budget
from routers import export as export_router
from routers import admin as admin_router

Base.metadata.create_all(bind=engine)

# Seed iniziale categorie + cleanup duplicati al primo avvio
with SessionLocal() as db:
    seed(db)
    cleanup_report = cleanup_duplicates(db)
    if cleanup_report["records_deleted"] > 0:
        print(f"[startup] Cleanup duplicati: {cleanup_report['records_deleted']} record rimossi")

app = FastAPI(title="Bilancio Personale API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router)
app.include_router(movimenti.router)
app.include_router(riepilogo.router)
app.include_router(ocr.router)
app.include_router(import_excel.router)
app.include_router(investimenti.router)
app.include_router(backup.router)
app.include_router(recurring.router)
app.include_router(budget.router)
app.include_router(export_router.router)
app.include_router(admin_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# ── Serve React frontend in production ──────────────────────────────────────
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(FRONTEND_DIST):
    # Serve static assets (JS, CSS, icons, manifest, etc.)
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    # Serve other static files in the root (favicon, icons/, manifest etc.)
    _icons_dir = os.path.join(FRONTEND_DIST, "icons")
    if os.path.isdir(_icons_dir):
        app.mount("/icons", StaticFiles(directory=_icons_dir), name="icons")

    @app.get("/favicon.svg", include_in_schema=False)
    def favicon():
        return FileResponse(os.path.join(FRONTEND_DIST, "favicon.svg"))

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        """Catch-all: serve index.html for React Router navigation."""
        # Check if a real file exists first (e.g. manifest.webmanifest, sw.js)
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
