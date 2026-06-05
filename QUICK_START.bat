@echo off
REM ============================================================================
REM    LUSAKA WASTE MANAGEMENT - AUTOMATIC SERVICE STARTER
REM    All services start in separate windows
REM ============================================================================

setlocal enabledelayedexpansion

set PYTHON=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe
set BASE=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb
set BACKEND=%BASE%\backend
set USER_DASH=%BASE%\user-dashboard
set ADMIN_DASH=%BASE%\admin-dashboard

cls
color 0A

title Lusaka Waste Management - Service Launcher

echo.
echo ============================================================================
echo                                                                     
echo        *** LUSAKA SMART WASTE MANAGEMENT SYSTEM - LAUNCHER ***                
echo                                                                     
echo ============================================================================
echo.

REM === PRE-FLIGHT CHECKS ===
echo [CHECKING] Prerequisites...
echo.

if not exist "%PYTHON%" (
    color 0C
    echo ERROR: Python venv not found!
    echo Expected at: %PYTHON%
    echo.
    pause
    exit /b 1
)

if not exist "%BACKEND%" (
    color 0C
    echo ERROR: Backend directory not found!
    echo Expected at: %BACKEND%
    echo.
    pause
    exit /b 1
)

if not exist "%USER_DASH%" (
    color 0C
    echo ERROR: User Dashboard directory not found!
    echo Expected at: %USER_DASH%
    echo.
    pause
    exit /b 1
)

if not exist "%ADMIN_DASH%" (
    color 0C
    echo ERROR: Admin Dashboard directory not found!
    echo Expected at: %ADMIN_DASH%
    echo.
    pause
    exit /b 1
)

echo [OK] All paths validated
echo [OK] Python venv found
echo [OK] All directories found
echo.

REM === START SERVICES ===
echo ============================================================================
echo [LAUNCHING] Starting services in new windows...
echo ============================================================================
echo.

REM Backend
echo [1/3] Starting Flask Backend on Port 5000...
start "Backend - Lusaka WM (5000)" /MIN cmd /k "cd /d "%BACKEND%" && "%PYTHON%" run.py"
echo        Opening: http://localhost:5000
echo        Health check: http://localhost:5000/
timeout /t 3 /nobreak

REM User Dashboard
echo [2/3] Starting User Dashboard on Port 8000...
start "User Dashboard - Lusaka WM (8000)" /MIN cmd /k "cd /d "%USER_DASH%" && "%PYTHON%" -m http.server 8000"
echo        Opening: http://localhost:8000/login.html
timeout /t 2 /nobreak

REM Admin Dashboard
echo [3/3] Starting Admin Dashboard on Port 8001...
start "Admin Dashboard - Lusaka WM (8001)" /MIN cmd /k "cd /d "%ADMIN_DASH%" && "%PYTHON%" -m http.server 8001"
echo        Opening: http://localhost:8001/index.html
timeout /t 2 /nobreak

echo.
echo ============================================================================
echo [SUCCESS] ALL SERVICES LAUNCHED!
echo ============================================================================
echo.
echo URLS:
echo   • Backend API:       http://localhost:5000
echo   • User Dashboard:    http://localhost:8000/login.html
echo   • Admin Dashboard:   http://localhost:8001/index.html
echo.
echo TROUBLESHOOTING:
echo   If port is in use, close other services or check:
echo     netstat -ano | findstr :5000
echo.
echo Launcher window will close in 10 seconds...
color 0A
timeout /t 10 /nobreak
exit /b 0
