# Admin Login Fix - Complete Guide

## 🔴 Problem
You're getting: **"Invalid email or password"** 
When trying to login with: admin@lcc.zm / admin123

## 🟢 Solution
The database hasn't been seeded with the admin user yet.

---

## ⚡ QUICK FIX (2 Minutes)

### Step 1: Navigate to the project folder
```
C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
Lusaka-waste-management-app-mariadb\
```

### Step 2: Double-click this file
```
FIX_ADMIN_LOGIN.bat
```

### Step 3: Wait for success message
You should see: **✓ SETUP COMPLETE!**

### Step 4: Refresh and login
- Refresh the admin dashboard: http://localhost:8001/index.html
- Login with:
  - **Email:** admin@lcc.zm
  - **Password:** admin123

---

## ✅ What Happens When You Run FIX_ADMIN_LOGIN.bat

The script will:

1. ✅ Verify Python venv exists
2. ✅ Check backend directory exists
3. ✅ Connect to MariaDB database
4. ✅ Create all database tables
5. ✅ Insert admin user (admin@lcc.zm / admin123)
6. ✅ Insert 5 collection zones
7. ✅ Insert supervisor and driver accounts
8. ✅ Insert sample resident account
9. ✅ Show success message

---

## 📋 Troubleshooting

### ❌ "Cannot connect to database"

**Cause:** XAMPP MySQL not running or database doesn't exist

**Fix:**
1. Start XAMPP Control Panel
2. Click "Start" next to MySQL
3. Open http://localhost/phpmyadmin
4. Create database: `smart_waste_lusaka`
5. Collation: `utf8mb4_unicode_ci`
6. Try FIX_ADMIN_LOGIN.bat again

### ❌ "Access denied for user 'root'"

**Cause:** Your MySQL has a password

**Fix:**
1. Edit file: `backend\.env`
2. Find line: `DATABASE_URL=mysql+pymysql://root:@localhost:3306/smart_waste_lusaka`
3. If password is "mypassword", change to: `mysql+pymysql://root:mypassword@localhost:3306/smart_waste_lusaka`
4. Try again

### ❌ "ModuleNotFoundError: No module named 'app'"

**Cause:** Python dependencies not installed

**Fix:**
```cmd
cd C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
   Lusaka-waste-management-app-mariadb\backend
pip install -r requirements.txt
```

Then try FIX_ADMIN_LOGIN.bat again

### ❌ Login still fails after running the fix

**Cause:** Database seeds but login still fails (rare)

**Check:**
1. Open http://localhost/phpmyadmin
2. Go to database: `smart_waste_lusaka`
3. Check table: `users`
4. Look for row with email: `admin@lcc.zm`
5. If found, password_hash should start with `$2b$` (bcrypt)

---

## 🔄 Alternative: Manual Database Seed

If FIX_ADMIN_LOGIN.bat doesn't work, try manually:

### Option A: Using Python
```cmd
cd C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
   Lusaka-waste-management-app-mariadb\backend

C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
venv\Scripts\python.exe seed.py
```

### Option B: Using RUN_SEED.bat
```cmd
cd C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
   Lusaka-waste-management-app-mariadb\backend

RUN_SEED.bat
```

---

## 📖 More Information

See these files for additional help:
- **ADMIN_LOGIN_FIX.md** - Detailed troubleshooting
- **README_ADMIN_FIX.txt** - Visual guide
- **QUICK_START_GUIDE.md** - General setup help

---

## ✅ Summary

| Step | Action | Status |
|------|--------|--------|
| 1 | Navigate to project folder | Do this |
| 2 | Double-click FIX_ADMIN_LOGIN.bat | Do this |
| 3 | Wait for "✓ SETUP COMPLETE!" | Wait here |
| 4 | Refresh admin dashboard | Do this |
| 5 | Login with admin@lcc.zm / admin123 | You're in! |

---

**That's it! Your admin user will be created and you can login.** 🎉
