#!/usr/bin/env python
"""
Master Launcher - Start all services for Lusaka Waste Management System
"""
import subprocess
import sys
import time
import os

VENV_PYTHON = r"C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe"
BASE_DIR = r"C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb"
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
USER_DASH_DIR = os.path.join(BASE_DIR, "user-dashboard")
ADMIN_DASH_DIR = os.path.join(BASE_DIR, "admin-dashboard")

def check_requirements():
    """Verify all required directories and python exist."""
    print("=" * 70)
    print("  PRE-FLIGHT CHECK")
    print("=" * 70)
    print()
    
    checks = [
        ("Python venv", VENV_PYTHON),
        ("Backend directory", BACKEND_DIR),
        ("User Dashboard directory", USER_DASH_DIR),
        ("Admin Dashboard directory", ADMIN_DASH_DIR),
    ]
    
    all_ok = True
    for name, path in checks:
        if os.path.exists(path):
            print(f"  ✓ {name}")
        else:
            print(f"  ✗ {name} - NOT FOUND: {path}")
            all_ok = False
    
    print()
    return all_ok

def start_service(name, script, port):
    """Start a service in a new window."""
    try:
        print(f"  [*] Starting {name} on port {port}...")
        # Use subprocess to start in new window
        subprocess.Popen([
            "cmd", "/c", f"title {name} & {VENV_PYTHON} {script}"
        ])
        time.sleep(2)
    except Exception as e:
        print(f"  [!] ERROR starting {name}: {e}")
        return False
    return True

def main():
    print("\n")
    print("╔" + "=" * 68 + "╗")
    print("║" + " " * 68 + "║")
    print("║" + "  LUSAKA SMART WASTE MANAGEMENT SYSTEM - SERVICE LAUNCHER".center(68) + "║")
    print("║" + " " * 68 + "║")
    print("╚" + "=" * 68 + "╝")
    print()
    
    # Pre-flight checks
    if not check_requirements():
        print("✗ Pre-flight checks failed!")
        input("Press Enter to exit...")
        sys.exit(1)
    
    print("=" * 70)
    print("  STARTING SERVICES")
    print("=" * 70)
    print()
    
    # Start all services
    services = [
        ("BACKEND API (Port 5000)", os.path.join(BACKEND_DIR, "run.py"), 5000),
        ("USER DASHBOARD (Port 8000)", os.path.join(USER_DASH_DIR, "start_user_dashboard.py"), 8000),
        ("ADMIN DASHBOARD (Port 8001)", os.path.join(ADMIN_DASH_DIR, "start_admin_dashboard.py"), 8001),
    ]
    
    for name, script, port in services:
        start_service(name, script, port)
    
    print()
    print("=" * 70)
    print("  ALL SERVICES LAUNCHED")
    print("=" * 70)
    print()
    print("Access your application:")
    print()
    print("  • Backend API:        http://localhost:5000")
    print("  • User Dashboard:     http://localhost:8000/login.html")
    print("  • Admin Dashboard:    http://localhost:8001/index.html")
    print()
    print("=" * 70)
    print()
    input("Press Enter to exit this launcher window...")

if __name__ == "__main__":
    main()
