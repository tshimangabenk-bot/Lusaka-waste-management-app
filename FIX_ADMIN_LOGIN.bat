@echo off
REM ============================================================================
REM    LUSAKA WASTE MANAGEMENT - AUTOMATED ADMIN LOGIN FIX
REM ============================================================================
REM This script:
REM   1. Verifies Python venv
REM   2. Checks database connection
REM   3. Seeds the database with admin user
REM   4. Shows you what to do next
REM ============================================================================

setlocal enabledelayedexpansion

set PYTHON=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe
set BACKEND=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb\backend

cls
color 0A

echo.
echo ============================================================================
echo                   ADMIN LOGIN - AUTOMATIC FIX
echo ============================================================================
echo.
echo Problem: "Invalid email or password" at admin dashboard login
echo Cause:   Database not seeded with admin user
echo Solution: Running setup...
echo.
echo ============================================================================
echo.

REM === Check Python ===
if not exist "!PYTHON!" (
    color 0C
    echo ERROR: Python venv not found at:
    echo   !PYTHON!
    echo.
    pause
    exit /b 1
)
echo [OK] Python venv found

REM === Check Backend ===
if not exist "!BACKEND!" (
    color 0C
    echo ERROR: Backend directory not found at:
    echo   !BACKEND!
    echo.
    pause
    exit /b 1
)
echo [OK] Backend directory found

echo.
echo Proceeding with database setup...
echo.

REM === Run seed ===
cd /d "!BACKEND!"

echo [*] Creating/seeding database with admin user...
echo.

"!PYTHON!" seed.py

if !errorlevel! equ 0 (
    color 0A
    echo.
    echo ============================================================================
    echo                         ✓ SETUP COMPLETE!
    echo ============================================================================
    echo.
    echo Admin user created successfully:
    echo.
    echo   Email:    admin@lcc.zm
    echo   Password: admin123
    echo.
    echo ============================================================================
    echo                        NEXT STEPS
    echo ============================================================================
    echo.
    echo 1. Close this window
    echo.
    echo 2. Go to admin dashboard in your browser
    echo    URL: http://localhost:8001/index.html
    echo.
    echo 3. Login with:
    echo    Email: admin@lcc.zm
    echo    Password: admin123
    echo.
    echo 4. You should now have access!
    echo.
    echo ============================================================================
    echo.
) else (
    color 0C
    echo.
    echo ============================================================================
    echo                         ✗ SETUP FAILED!
    echo ============================================================================
    echo.
    echo Check the error messages above. Common issues:
    echo.
    echo 1. XAMPP MySQL not running
    echo    → Start XAMPP and ensure MySQL service is ON
    echo.
    echo 2. Database doesn't exist
    echo    → Create 'smart_waste_lusaka' database in phpMyAdmin
    echo      URL: http://localhost/phpmyadmin
    echo.
    echo 3. Wrong database URL in .env
    echo    → Check: !BACKEND!\.env
    echo    → Should be: mysql+pymysql://root:@localhost:3306/smart_waste_lusaka
    echo.
    echo ============================================================================
    echo.
)

pause
