#!/usr/bin/env python
"""
Admin User Creation Script
Fixes: "Invalid email or password" error on login
"""
import sys
import os
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

def main():
    print("=" * 80)
    print("  LUSAKA WASTE MANAGEMENT - ADMIN USER SETUP")
    print("=" * 80)
    print()
    
    # Import and run seed
    try:
        print("[*] Initializing app and database connection...")
        from seed import seed
        
        print("[*] Running seed script...")
        seed()
        
        print()
        print("=" * 80)
        print("  ✓ SUCCESS!")
        print("=" * 80)
        print()
        print("Admin user created:")
        print("  Email:    admin@lcc.zm")
        print("  Password: admin123")
        print()
        print("Next steps:")
        print("  1. Close this window")
        print("  2. Refresh the admin dashboard in your browser")
        print("  3. Login with credentials above")
        print()
        return 0
        
    except Exception as e:
        print()
        print("=" * 80)
        print("  ✗ ERROR")
        print("=" * 80)
        print()
        print(f"Error: {e}")
        print()
        print("Troubleshooting:")
        print("  1. Ensure XAMPP MySQL is running")
        print("  2. Ensure database 'smart_waste_lusaka' exists")
        print("  3. Check database connection: DATABASE_URL in .env")
        print()
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
