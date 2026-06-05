#!/usr/bin/env python
"""
Pre-flight check for Lusaka Waste Management System.
Verifies Python environment, dependencies, and database connectivity.
"""
import sys
import os
from pathlib import Path

def check_python_version():
    """Verify Python version."""
    print("[*] Checking Python version...")
    version = sys.version_info
    if version.major == 3 and version.minor >= 9:
        print(f"    ✓ Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print(f"    ✗ Python {version.major}.{version.minor} (requires 3.9+)")
        return False

def check_venv():
    """Check if we're in a venv."""
    print("[*] Checking virtual environment...")
    in_venv = hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix)
    if in_venv:
        print(f"    ✓ Using venv at {sys.prefix}")
        return True
    else:
        print("    ⚠ Not in a virtual environment (may cause import issues)")
        return False

def check_dependencies():
    """Check if required packages are installed."""
    print("[*] Checking dependencies...")
    required = [
        'flask',
        'flask_cors',
        'flask_sqlalchemy',
        'flask_migrate',
        'flask_jwt_extended',
        'flask_marshmallow',
        'sqlalchemy',
        'pymysql',
        'dotenv'
    ]
    
    missing = []
    for package in required:
        try:
            __import__(package.replace('_', '-'))
            print(f"    ✓ {package}")
        except ImportError:
            print(f"    ✗ {package} - NOT FOUND")
            missing.append(package)
    
    return len(missing) == 0, missing

def check_database():
    """Check if database can be accessed."""
    print("[*] Checking database connectivity...")
    try:
        import pymysql
        conn = pymysql.connect(
            host='localhost',
            user='root',
            password='',
            port=3306
        )
        cursor = conn.cursor()
        cursor.execute("SHOW DATABASES")
        databases = cursor.fetchall()
        cursor.close()
        conn.close()
        
        db_list = [db[0] for db in databases]
        if 'smart_waste_lusaka' in db_list:
            print("    ✓ Database 'smart_waste_lusaka' exists")
            return True
        else:
            print("    ⚠ Database 'smart_waste_lusaka' not found")
            print(f"    Available databases: {', '.join(db_list)}")
            return False
    except Exception as e:
        print(f"    ✗ Cannot connect to MariaDB: {e}")
        print("    → Ensure XAMPP MySQL/MariaDB is running")
        return False

def main():
    print("=" * 60)
    print("  Lusaka Waste Management System - Pre-flight Check")
    print("=" * 60)
    print()
    
    checks = [
        ("Python Version", check_python_version()),
        ("Virtual Environment", check_venv()),
    ]
    
    deps_ok, missing = check_dependencies()
    checks.append(("Dependencies", deps_ok))
    
    db_ok = check_database()
    checks.append(("Database", db_ok))
    
    print()
    print("=" * 60)
    print("  Summary")
    print("=" * 60)
    for name, result in checks:
        status = "✓" if result else "✗"
        print(f"  {status} {name}")
    
    if not deps_ok:
        print()
        print("To install missing dependencies, run:")
        print(f"  pip install {' '.join(missing)}")
    
    print()
    all_ok = all(result for _, result in checks)
    if all_ok:
        print("✓ All checks passed! Ready to start.")
    else:
        print("✗ Some checks failed. Please fix issues before running.")
    
    return 0 if all_ok else 1

if __name__ == "__main__":
    sys.exit(main())
