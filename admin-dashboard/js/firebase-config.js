/**
 * Firebase Web App Configuration — Admin Dashboard
 *
 * Fill in the values from:
 *   Firebase Console → Project Settings → General → Your apps → Web app
 *
 * VAPID key:
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

window.FIREBASE_VAPID_KEY = "REPLACE_WITH_YOUR_VAPID_KEY";

if (FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("REPLACE")) {
    try {
        if (typeof firebase !== "undefined" && !firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
    } catch (e) {
        console.warn("Firebase Admin SDK init failed:", e.message);
    }
}
