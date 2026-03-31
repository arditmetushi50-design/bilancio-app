@echo off
echo === Avvio Backend Bilancio ===
cd /d "%~dp0backend"

REM Installa dipendenze se non presenti
pip install -r requirements.txt -q

REM Avvia server
echo.
echo Backend pronto su http://localhost:8000
echo Docs API: http://localhost:8000/docs
echo.
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
