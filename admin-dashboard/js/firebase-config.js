const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCntOyLC7GS7VOuNDhnOxzRbARP12GubgE",
    authDomain:        "lusaka-waste-management.firebaseapp.com",
    databaseURL:       "https://lusaka-waste-management-default-rtdb.firebaseio.com",
    projectId:         "lusaka-waste-management",
    storageBucket:     "lusaka-waste-management.firebasestorage.app",
    messagingSenderId: "147528803192",
    appId:             "1:147528803192:web:5ec1e1a6348221d1009e8d",
    measurementId:     "G-BSEEJ7EYVC",
};

// VAPID key — Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
window.FIREBASE_VAPID_KEY = "BBE9lavu65K5W2_UvA6eFPP5veVa_V6uK04iXSWGt21GJbVx0jSmgFkptk8iwTfku7RO2XhaLVJGHsj4-Xtyyz8";

try {
    if (typeof firebase !== "undefined" && !firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
} catch (e) {
    console.warn("Firebase Admin SDK init failed:", e.message);
}
