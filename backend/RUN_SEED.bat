@echo off
setlocal enabledelayedexpansion

set PYTHON=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe
set BACKEND=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb\backend

cls
color 0A

echo ============================================================================
echo            LUSAKA WASTE MANAGEMENT - DATABASE SEEDING
echo ============================================================================
echo.

if not exist "!PYTHON!" (
    color 0C
    echo ERROR: Python not found at !PYTHON!
    pause
    exit /b 1
)

echo [*] Running database seed script...
echo     This will create tables and add admin user
echo.

cd /d "!BACKEND!"
"!PYTHON!" seed.py

if !errorlevel! equ 0 (
    color 0A
    echo.
    echo ============================================================================
    echo [SUCCESS] Database seeded successfully!
    echo ============================================================================
    echo.
    echo Admin user created:
    echo   Email: admin@lcc.zm
    echo   Password: admin123
    echo.
    echo You can now:
    echo   1. Close this window
    echo   2. Go back to the admin dashboard
    echo   3. Login with the credentials above
    echo.
) else (
    color 0C
    echo.
    echo ============================================================================
    echo [ERROR] Seed script failed!
    echo ============================================================================
    echo.
    echo Check the output above for error details
    echo.
)

pause
