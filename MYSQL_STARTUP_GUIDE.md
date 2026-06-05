# ⚠️ MySQL Not Running - STEP-BY-STEP FIX

## Problem
XAMPP MySQL service is not running. You need to start it first.

---

## ✅ SOLUTION (4 Simple Steps)

### Step 1: Open XAMPP Control Panel

Navigate to:
```
C:\xampp\xampp-control.exe
```

**Or:** Click the XAMPP icon on your desktop

### Step 2: Start MySQL Service

In the XAMPP Control Panel window:

1. Look for **"MySQL"** in the list
2. Click the **"Start"** button next to it
   - It may show as "Stop" if already running
   - You want to see a **green checkmark** ✓
   
   ![Example]
   MySQL    [Start] [Stop]  ✓  (PID: 1234)

3. Wait 2-3 seconds for it to fully start

### Step 3: Verify MySQL is Running

Open your browser and go to:
```
http://localhost/phpmyadmin
```

- Should show phpMyAdmin login page
- If yes, MySQL is running ✓

### Step 4: Now Run the Database Setup

Go to:
```
C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
Lusaka-waste-management-app-mariadb\
```

**Double-click:**
```
SETUP_DATABASE.bat
```

This will:
- ✅ Create the database
- ✅ Seed admin user
- ✅ Setup everything

Wait for: **✓ SUCCESS!**

---

## 🎯 Then Login

1. Go to: http://localhost:8001/index.html
2. Email: admin@lcc.zm
3. Password: admin123
4. You're in! 🎉

---

## 🆘 Still Not Working?

### MySQL won't start?

**Try this:**
1. Close XAMPP Control Panel
2. Right-click XAMPP Control Panel
3. Click "Run as Administrator"
4. Try starting MySQL again

### "Port 3306 already in use"?

**Close the service:**
```cmd
taskkill /F /IM mysqld.exe
```

Then try starting again.

### Port 3306 keeps being in use?

Check if port is really in use:
```cmd
netstat -ano | findstr :3306
```

If something is running on 3306, kill it:
```cmd
taskkill /PID <PID_NUMBER> /F
```

---

## 📱 Visual Guide

```
┌─ XAMPP Control Panel ──────────────┐
│                                    │
│ Apache     [Start]  [Stop]  ✓      │  ← Should be green ✓
│ MySQL      [Start]  [Stop]  ✗  ←   │  ← THIS needs to be green ✓
│ FileZilla  [Start]  [Stop]  ✗      │
│ Mercury    [Start]  [Stop]  ✗      │
│                                    │
│ Click "Start" next to MySQL ↑      │
│                                    │
└────────────────────────────────────┘
```

Once MySQL shows green ✓, run: SETUP_DATABASE.bat

---

## ✨ Quick Checklist

- [ ] XAMPP Control Panel opened
- [ ] MySQL "Start" button clicked
- [ ] MySQL shows green checkmark ✓
- [ ] phpMyAdmin loads at http://localhost/phpmyadmin
- [ ] Double-clicked SETUP_DATABASE.bat
- [ ] Saw "✓ SUCCESS!" message
- [ ] Admin dashboard login works!

---

## 🎉 You're Done!

Login details:
- **Email:** admin@lcc.zm
- **Password:** admin123
- **URL:** http://localhost:8001/index.html
