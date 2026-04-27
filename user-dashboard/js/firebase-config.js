/**
 * Firebase Web App Configuration
 *
 * Get these values from:
 *   Firebase Console → Project Settings → General → Your apps → Web app
 *
 * If you haven't added a web app yet:
 *   1. Go to https://console.firebase.google.com
 *   2. Open project "smart-waste-management-s-6225c"
 *   3. Click the gear icon → Project Settings → "Add app" → Web (</>)
 *   4. Copy the firebaseConfig object shown and paste the values below.
 *
 * VAPID key (for push notifications):
 *   Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
 */

const FIREBASE_CONFIG = {
    apiKey:            "REPLACE_WITH_YOUR_API_KEY",
    authDomain:        "smart-waste-management-s-6225c.firebaseapp.com",
    projectId:         "smart-waste-management-s-6225c",
    storageBucket:     "smart-waste-management-s-6225c.appspot.com",
    messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
    appId:             "REPLACE_WITH_YOUR_APP_ID",
};

// VAPID key for web push (Cloud Messaging → Web Push certificates)
window.FIREBASE_VAPID_KEY = "REPLACE_WITH_YOUR_VAPID_KEY";

// Only initialise if the config has been filled in
if (FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("REPLACE")) {
    try {
        if (typeof firebase !== "undefined" && !firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
    } catch (e) {
        console.warn("Firebase web SDK init failed:", e.message);
    }
}
