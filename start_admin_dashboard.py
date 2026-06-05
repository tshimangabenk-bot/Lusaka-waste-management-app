#!/usr/bin/env python
"""
Start Admin Dashboard - Lusaka Waste Management System
"""
import subprocess
import sys
import os

VENV_PYTHON = r"C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe"
ADMIN_DASH_DIR = r"C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb\admin-dashboard"

print("=" * 70)
print("  Starting Admin Dashboard (Port 8001)")
print("=" * 70)
print()

if not os.path.exists(VENV_PYTHON):
    print(f"ERROR: Python not found at {VENV_PYTHON}")
    sys.exit(1)

if not os.path.exists(ADMIN_DASH_DIR):
    print(f"ERROR: Dashboard directory not found at {ADMIN_DASH_DIR}")
    sys.exit(1)

os.chdir(ADMIN_DASH_DIR)
print(f"Working directory: {os.getcwd()}")
print(f"Running: {VENV_PYTHON} -m http.server 8001")
print()

subprocess.call([VENV_PYTHON, "-m", "http.server", "8001"])
