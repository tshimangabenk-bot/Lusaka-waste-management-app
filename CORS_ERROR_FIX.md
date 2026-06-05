# 🔴 CORS Error - Backend Not Responding

## Problem
```
Failed to fetch
Access to fetch at 'http://localhost:5000/api/auth/login' from origin 'http://localhost:8001'
has been blocked by CORS policy
```

Plus: `net::ERR_FAILED` - This means **backend is not responding at all**

---

## 🔍 Root Cause
The backend Flask server is either:
1. ❌ Not running
2. ❌ Crashed after startup
3. ❌ On wrong port
4. ❌ Has errors preventing it from starting

---

## ✅ SOLUTION

### Step 1: Check If Backend is Running

**Option A (Easiest):**
```
Double-click: CHECK_BACKEND.bat
(In: C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
     Lusaka-waste-management-app-mariadb\)
```

**Option B (Manual):**
Open browser and go to:
```
http://localhost:5000
```

If you see:
```json
{"status": "ok", "service": "Smart Waste Management API — Lusaka"}
```
✓ Backend is running, proceed to Step 3

If you see: "Cannot reach" or blank page
✗ Backend is NOT running, proceed to Step 2

### Step 2: Restart Backend

**Find the Flask window** (should be minimized)

**If found:**
- Right-click on it
- Click "Restore"
- Check for error messages
- If it shows errors, close it and continue below

**If NOT found or closed:**
1. Open Command Prompt
2. Run:
```cmd
cd C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
   Lusaka-waste-management-app-mariadb\backend

C:\xampp\htdocs\Lusaka-waste-management-app-mariadb\
venv\Scripts\python.exe run.py
```

3. Wait for:
```
 * Running on http://127.0.0.1:5000
```

4. Keep this window open

### Step 3: Clear Browser Cache

Now that backend is running, clear your browser cache:

**Chrome:**
- Ctrl+Shift+Delete
- Select "All time"
- Check: Cookies, Cache, etc.
- Click "Clear data"
- Close and reopen browser

**Firefox:**
- Ctrl+Shift+Delete
- Select "Everything"
- Click "Clear Now"
- Close and reopen browser

**Edge:**
- Ctrl+Shift+Delete
- Select "All time"
- Click "Clear now"
- Close and reopen browser

### Step 4: Try Login Again

1. Open: http://localhost:8001/index.html
2. Enter:
   - Email: admin@lcc.zm
   - Password: admin123
3. Click Login

Should work now! ✅

---

## 🆘 Still Not Working?

### Backend crashes immediately?

Check the error message in the Flask window. Common errors:

**"ModuleNotFoundError: No module named 'app'"**
```cmd
cd backend
pip install -r requirements.txt
```

**"sqlalchemy.exc.OperationalError: (pymysql.err.OperationalError)"**
- MySQL not running
- Database doesn't exist
- Wrong database URL in .env

**"Address already in use"**
```cmd
taskkill /F /IM python.exe
```
Then start Flask again

### Backend runs but still get CORS error?

Try this:

1. **Hard refresh admin dashboard:** Ctrl+F5 (or Cmd+Shift+R on Mac)

2. **Clear all browser data:**
   - Ctrl+Shift+Delete
   - Select "All time"
   - Clear everything
   - Restart browser

3. **Check backend is responding:**
   ```
   Open: http://localhost:5000/
   Should see JSON response
   ```

4. **Check backend logs:**
   - Look in the Flask terminal window
   - Should show: POST /api/auth/login
   - Any error messages?

### Port conflict?

Check what's using ports:
```cmd
netstat -ano | findstr :5000
netstat -ano | findstr :8000
netstat -ano | findstr :8001
```

If something is using them, kill it:
```cmd
taskkill /PID <PID_NUMBER> /F
```

---

## 📋 Quick Checklist

- [ ] Backend is running (Flask window open)
- [ ] Can access http://localhost:5000 and see JSON
- [ ] Browser cache cleared (Ctrl+Shift+Delete)
- [ ] Browser restarted
- [ ] Try login again

---

## 🎯 What CORS Actually Means

CORS = Cross-Origin Resource Sharing

The issue is:
- Frontend on: `localhost:8001`
- Backend on: `localhost:5000`
- These are different "origins"
- Browser security blocks requests between them

**Our backend has CORS enabled**, so it should work. If it's blocked, it means:
- Backend isn't responding (net::ERR_FAILED)
- Browser hasn't validated the CORS headers yet (needs cache clear)

---

## 📁 Files Available

| File | Purpose |
|------|---------|
| CHECK_BACKEND.bat | Quick backend status check |
| This file | Detailed CORS troubleshooting |

---

**Still stuck?** Try restarting everything:
1. Close Flask window
2. Close browser
3. Close admin dashboard
4. Kill any Python processes: `taskkill /F /IM python.exe`
5. Start Flask again
6. Clear cache
7. Try login

If it works after these steps, bookmark this guide! 📌
