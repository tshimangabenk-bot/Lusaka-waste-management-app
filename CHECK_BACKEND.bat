@echo off
REM ============================================================================
REM    BACKEND CHECK - Verify Flask is running on port 5000
REM ============================================================================

setlocal enabledelayedexpansion

cls
color 0A

echo.
echo ============================================================================
echo                    BACKEND STATUS CHECK
echo ============================================================================
echo.

echo [*] Checking if Flask backend is running on port 5000...
echo.

REM Check if port 5000 is listening
netstat -ano | findstr :5000 >nul 2>&1

if !errorlevel! equ 0 (
    color 0A
    echo [OK] Port 5000 is listening - Backend appears to be running!
    echo.
    
    REM Try to access the backend
    echo [*] Testing backend health check...
    powershell -Command "(New-Object System.Net.WebClient).DownloadString('http://localhost:5000')" >nul 2>&1
    
    if !errorlevel! equ 0 (
        echo [OK] Backend is responding to requests!
        echo.
        echo If you're still getting CORS errors:
        echo   1. Hard refresh admin dashboard: Ctrl+Shift+Delete
        echo   2. Clear browser cache completely
        echo   3. Close browser and reopen
        echo   4. Try login again
        echo.
    ) else (
        echo [!] Port 5000 is in use but backend not responding
        echo.
        echo Try:
        echo   1. Kill the process: taskkill /F /IM python.exe
        echo   2. Restart the backend
        echo   3. Try login again
        echo.
    )
) else (
    color 0C
    echo [ERROR] Backend is NOT running on port 5000!
    echo.
    echo Solution:
    echo   1. Close all Flask windows
    echo   2. Open new Command Prompt
    echo   3. Navigate to backend:
    echo      cd C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
    echo         Lusaka-waste-management-app-mariadb\backend
    echo   4. Run Flask:
    echo      C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
    echo      venv\Scripts\python.exe run.py
    echo   5. Wait for "Running on http://127.0.0.1:5000"
    echo   6. Then try login again
    echo.
)

echo ============================================================================
echo.

pause
