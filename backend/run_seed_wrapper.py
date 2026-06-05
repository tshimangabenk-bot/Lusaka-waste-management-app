#!/usr/bin/env python
"""
Wrapper script to run the seed function with output capture.
"""
import sys
import os

# Ensure we're in the right directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

try:
    from seed import seed
    print("=" * 60)
    print("Starting Database Seeding...")
    print("=" * 60)
    seed()
    print("=" * 60)
    print("Seeding completed successfully!")
    print("=" * 60)
except Exception as e:
    print("=" * 60)
    print(f"ERROR during seeding: {type(e).__name__}")
    print("=" * 60)
    print(str(e))
    import traceback
    traceback.print_exc()
    sys.exit(1)
