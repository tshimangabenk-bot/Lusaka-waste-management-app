@echo off
REM ============================================================================
REM    COMPLETE DATABASE SETUP - Start MySQL, Create DB, Seed Data
REM ============================================================================

setlocal enabledelayedexpansion

set XAMPP_PATH=C:\xampp
set MYSQL_BIN=%XAMPP_PATH%\mysql\bin\mysql.exe
set MYSQLD_SCRIPT=%XAMPP_PATH%\mysql_start.bat
set PYTHON=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe
set BACKEND=C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb\backend

cls
color 0A

echo.
echo ============================================================================
echo              DATABASE SETUP - COMPLETE INITIALIZATION
echo ============================================================================
echo.
echo This script will:
echo   1. Start XAMPP MySQL service
echo   2. Create database: smart_waste_lusaka
echo   3. Seed database with admin user
echo.
echo ============================================================================
echo.

REM === Check if MySQL is installed ===
if not exist "%MYSQL_BIN%" (
    color 0C
    echo ERROR: MySQL not found in XAMPP
    echo Expected at: %MYSQL_BIN%
    echo.
    pause
    exit /b 1
)
echo [OK] MySQL found in XAMPP

REM === Start MySQL ===
echo.
echo [*] Starting XAMPP MySQL service...
timeout /t 2 /nobreak

if exist "%MYSQLD_SCRIPT%" (
    call "%MYSQLD_SCRIPT%"
    echo [*] Waiting for MySQL to start...
    timeout /t 5 /nobreak
) else (
    echo [!] mysql_start.bat not found, trying direct start...
    echo [*] Waiting for MySQL to start...
    timeout /t 3 /nobreak
)

REM === Test MySQL connection ===
echo [*] Testing MySQL connection...
"%MYSQL_BIN%" -u root -e "SELECT 1" >nul 2>&1

if !errorlevel! equ 0 (
    echo [OK] MySQL is running!
) else (
    color 0C
    echo.
    echo ERROR: Cannot connect to MySQL
    echo.
    echo Troubleshooting:
    echo   1. Open XAMPP Control Panel: C:\xampp\xampp-control.exe
    echo   2. Click "Start" button next to "MySQL"
    echo   3. Wait for green indicator
    echo   4. Try again
    echo.
    pause
    exit /b 1
)

REM === Create database ===
echo.
echo [*] Creating database 'smart_waste_lusaka'...

"%MYSQL_BIN%" -u root -e "CREATE DATABASE IF NOT EXISTS smart_waste_lusaka CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" >nul 2>&1

if !errorlevel! equ 0 (
    echo [OK] Database created successfully
) else (
    color 0C
    echo [!] Warning: Could not create database
    echo Continuing anyway...
)

REM === Run Python seed ===
echo.
echo [*] Seeding database with admin user...
echo.

cd /d "%BACKEND%"
"%PYTHON%" seed.py

if !errorlevel! equ 0 (
    color 0A
    echo.
    echo ============================================================================
    echo                         ✓ SUCCESS!
    echo ============================================================================
    echo.
    echo Database is ready! Admin user created:
    echo.
    echo   Email:    admin@lcc.zm
    echo   Password: admin123
    echo.
    echo Next steps:
    echo   1. Close this window
    echo   2. Open admin dashboard: http://localhost:8001/index.html
    echo   3. Login with credentials above
    echo.
    echo ============================================================================
    echo.
) else (
    color 0C
    echo.
    echo ============================================================================
    echo                         ✗ SEEDING FAILED
    echo ============================================================================
    echo.
    echo Check the error messages above.
    echo.
    echo Common issues:
    echo   1. Database connection failed
    echo      → Verify MySQL is running (green in XAMPP Control Panel)
    echo   2. Python import error
    echo      → Run: pip install -r requirements.txt
    echo.
    echo ============================================================================
    echo.
)

pause
