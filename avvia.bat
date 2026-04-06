@echo off
title Bilancio Personale
echo ============================================
echo    BILANCIO PERSONALE - Avvio server
echo ============================================
echo.

:: Percorsi
set BASEDIR=%~dp0
set BACKEND=%BASEDIR%backend
set FRONTEND=%BASEDIR%frontend
set STATIC=%BACKEND%\static
set VENV=%BACKEND%\venv\Scripts\python.exe

:: 1. Build frontend
echo [1/3] Build frontend...
cd /d "%FRONTEND%"
call npm run build >nul 2>&1
if errorlevel 1 (
    echo ERRORE: build frontend fallito!
    pause
    exit /b 1
)
echo       Build completato.

:: 2. Copia build nella cartella static del backend
echo [2/3] Copia file in backend/static...
if exist "%STATIC%" rmdir /s /q "%STATIC%"
xcopy /E /I /Q "%FRONTEND%\dist" "%STATIC%" >nul
echo       File copiati.

:: 3. Avvia backend
echo [3/3] Avvio server sulla porta 8000...
echo.

:: Trova IP locale
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

echo ============================================
echo    SERVER ATTIVO!
echo.
echo    Da questo PC:
echo    http://localhost:8000
echo.
echo    Dal telefono (stessa rete WiFi):
echo    http://%IP%:8000
echo.
echo    Per installare come app Android:
echo    1. Apri Chrome sul telefono
echo    2. Vai su http://%IP%:8000
echo    3. Tocca il menu (tre puntini)
echo    4. Tocca "Aggiungi a schermata Home"
echo ============================================
echo.
echo    Premi CTRL+C per chiudere il server
echo.

cd /d "%BACKEND%"
"%VENV%" -m uvicorn main:app --host 0.0.0.0 --port 8000
pause
