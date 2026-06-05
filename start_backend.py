#!/usr/bin/env python
"""
Start Flask Backend - Lusaka Waste Management System
"""
import subprocess
import sys
import os

VENV_PYTHON = r"C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe"
BACKEND_DIR = r"C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\Lusaka-waste-management-app-mariadb\backend"

print("=" * 70)
print("  Starting Flask Backend (Port 5000)")
print("=" * 70)
print()

if not os.path.exists(VENV_PYTHON):
    print(f"ERROR: Python not found at {VENV_PYTHON}")
    sys.exit(1)

if not os.path.exists(BACKEND_DIR):
    print(f"ERROR: Backend directory not found at {BACKEND_DIR}")
    sys.exit(1)

os.chdir(BACKEND_DIR)
print(f"Working directory: {os.getcwd()}")
print(f"Running: {VENV_PYTHON} run.py")
print()

subprocess.call([VENV_PYTHON, "run.py"])
