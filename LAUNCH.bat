@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM    Lusaka Waste Management - Service Launcher with Verification
REM ============================================================================

set PYTHON=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe
set BASE=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb
set BACKEND=%BASE%\backend
set USER_DASH=%BASE%\user-dashboard
set ADMIN_DASH=%BASE%\admin-dashboard

cls

echo ============================================================================
echo              LUSAKA SMART WASTE MANAGEMENT SYSTEM
echo                     SERVICE LAUNCHER
echo ============================================================================
echo.

REM Check Python
if not exist "%PYTHON%" (
    echo ERROR: Python venv not found at:
    echo   %PYTHON%
    echo.
    pause
    exit /b 1
)
echo [OK] Python venv found

REM Check directories
if not exist "%BACKEND%" (
    echo ERROR: Backend not found at %BACKEND%
    pause
    exit /b 1
)
echo [OK] Backend directory found

if not exist "%USER_DASH%" (
    echo ERROR: User Dashboard not found at %USER_DASH%
    pause
    exit /b 1
)
echo [OK] User Dashboard directory found

if not exist "%ADMIN_DASH%" (
    echo ERROR: Admin Dashboard not found at %ADMIN_DASH%
    pause
    exit /b 1
)
echo [OK] Admin Dashboard directory found

echo.
echo Testing Flask app initialization...
cd /d "%BACKEND%"
"%PYTHON%" -c "from app import create_app; app = create_app(); print('✓ Flask app initialized')" >nul 2>&1

if !errorlevel! neq 0 (
    echo WARNING: Flask app may have issues. Attempting to start anyway...
    echo.
)

echo.
echo ============================================================================
echo                       LAUNCHING SERVICES
echo ============================================================================
echo.

REM Start Backend
echo [*] Starting Flask Backend (Port 5000)...
start "Lusaka - Backend (5000)" cmd /k "cd /d "%BACKEND%" && "%PYTHON%" run.py"
timeout /t 3 /nobreak

REM Start User Dashboard
echo [*] Starting User Dashboard (Port 8000)...
start "Lusaka - User Dashboard (8000)" cmd /k "cd /d "%USER_DASH%" && "%PYTHON%" -m http.server 8000"
timeout /t 2 /nobreak

REM Start Admin Dashboard
echo [*] Starting Admin Dashboard (Port 8001)...
start "Lusaka - Admin Dashboard (8001)" cmd /k "cd /d "%ADMIN_DASH%" && "%PYTHON%" -m http.server 8001"

echo.
echo ============================================================================
echo                    ✓ ALL SERVICES LAUNCHED
echo ============================================================================
echo.
echo Access your application:
echo.
echo   Backend API:        http://localhost:5000
echo   User Dashboard:     http://localhost:8000/login.html
echo   Admin Dashboard:    http://localhost:8001/index.html
echo.
echo ============================================================================
echo.
pause
