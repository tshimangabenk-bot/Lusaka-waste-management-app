# ❌ Admin Login Issue - SOLUTION

## Problem
"Invalid email or password" when trying to login to admin dashboard with:
- Email: admin@lcc.zm
- Password: admin123

## Root Cause
The database has NOT been seeded with initial data, including the admin user.

## Solution - Follow These Steps

### Step 1: Open Command Prompt

Navigate to the backend directory:
```cmd
cd C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
   Lusaka-waste-management-app-mariadb\backend
```

### Step 2: Run the Seed Script

Run one of these commands:

**Option A (Recommended - Simplest):**
```cmd
RUN_SEED.bat
```

**Option B (Direct Python):**
```cmd
C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
venv\Scripts\python.exe seed.py
```

**Option C (Direct Python - Alternative):**
```cmd
C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
venv\Scripts\python.exe setup_admin.py
```

### Step 3: Wait for Completion

You should see output like:
```
[*] Initializing app and database connection...
[*] Running seed script...
Tables created.
[Admin user created]
...
✓ SUCCESS!
```

### Step 4: Try Login Again

1. Refresh the admin dashboard in your browser
2. Try logging in with:
   - **Email:** admin@lcc.zm
   - **Password:** admin123

---

## What Gets Created

The seed script creates:

### Admin User
- Email: admin@lcc.zm
- Password: admin123
- Role: admin

### Also Created
- 5 collection zones (Kabulonga, Northmead, Kanyama, Matero, Chelston)
- Supervisor account (supervisor@lcc.zm / super123)
- 2 Driver accounts
- Sample resident account
- Other demo data

---

## Troubleshooting

### Error: "Cannot connect to database"
**Solution:**
1. Start XAMPP
2. Ensure MySQL is running
3. Create database in phpMyAdmin:
   - Go to http://localhost/phpmyadmin
   - Create database: `smart_waste_lusaka`
   - Collation: utf8mb4_unicode_ci
4. Try again

### Error: "ModuleNotFoundError"
**Solution:**
```cmd
cd backend
pip install -r requirements.txt
```

### Error: "Access denied for user 'root'"
**Solution:**
Check your .env file:
```
DATABASE_URL=mysql+pymysql://root:@localhost:3306/smart_waste_lusaka
```

If XAMPP MySQL has a password, update it.

### Login still fails after seeding
**Solution:**
1. Manually verify in phpMyAdmin:
   - Open http://localhost/phpmyadmin
   - Check table: `users`
   - Should have row with email: admin@lcc.zm
   
2. If missing, the seed failed - check the error message

---

## Quick Test

To verify the database was seeded correctly, run:

```cmd
C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\venv\Scripts\python.exe -c "
from app import create_app, db
from app.models import User
app = create_app()
with app.app_context():
    admin = User.query.filter_by(email='admin@lcc.zm').first()
    if admin:
        print(f'✓ Admin user found: {admin.email}')
    else:
        print('✗ Admin user NOT found')
"
```

---

## Summary

**TL;DR:**

1. Open Command Prompt
2. cd to backend directory
3. Run: `RUN_SEED.bat`
4. Wait for success message
5. Refresh browser and login

**That's it!** ✅
