@echo off
REM ============================================================================
REM    COMPREHENSIVE CORS FIX - Restart Backend with Enhanced Headers
REM ============================================================================

setlocal enabledelayedexpansion

set PYTHON=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe
set BACKEND=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb\backend

cls
color 0A

echo.
echo ============================================================================
echo                        CORS FIX - BACKEND RESTART
echo ============================================================================
echo.
echo What will happen:
echo   1. Kill any existing Flask processes
echo   2. Start fresh Flask backend with CORS fixes
echo   3. Test CORS headers
echo.
echo ============================================================================
echo.

REM === Kill existing Python processes ===
echo [*] Cleaning up existing processes...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak

REM === Verify Python ===
if not exist "!PYTHON!" (
    color 0C
    echo ERROR: Python not found at !PYTHON!
    pause
    exit /b 1
)
echo [OK] Python venv found

REM === Start backend ===
echo [*] Starting Flask backend with enhanced CORS headers...
echo.

cd /d "!BACKEND!"
"!PYTHON!" run.py

REM If we reach here, Flask exited
color 0C
echo.
echo Backend has stopped!
echo Check error messages above.
echo.
pause
