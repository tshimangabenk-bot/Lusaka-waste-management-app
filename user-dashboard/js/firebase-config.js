const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyB2a2Ujs89NelznCuZvS5I9XhCWCk3J6r8",
    authDomain:        "smart-waste-management-s-6225c.firebaseapp.com",
    databaseURL:       "https://smart-waste-management-s-6225c-default-rtdb.firebaseio.com",
    projectId:         "smart-waste-management-s-6225c",
    storageBucket:     "smart-waste-management-s-6225c.firebasestorage.app",
    messagingSenderId: "202624977732",
    appId:             "1:202624977732:web:82f47e768715464d332511",
    measurementId:     "G-JLTNRGFJ1P",
};

// VAPID key — Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
window.FIREBASE_VAPID_KEY = "BBE9lavu65K5W2_UvA6eFPP5veVa_V6uK04iXSWGt21GJbVx0jSmgFkptk8iwTfku7RO2XhaLVJGHsj4-Xtyyz8";

try {
    if (typeof firebase !== "undefined" && !firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
} catch (e) {
    console.warn("Firebase web SDK init failed:", e.message);
}
