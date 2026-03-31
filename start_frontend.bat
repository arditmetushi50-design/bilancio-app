@echo off
echo === Avvio Frontend Bilancio ===
cd /d "%~dp0frontend"

REM Installa dipendenze se non presenti
if not exist "node_modules" (
    echo Installazione dipendenze npm...
    npm install
)

echo.
echo Frontend pronto su http://localhost:5173
echo.
npm run dev
pause
