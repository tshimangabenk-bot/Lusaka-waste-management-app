/**
 * Firebase Cloud Messaging service worker.
 * Handles background push notifications when the browser tab is closed.
 *
 * This file MUST live at the root of user-dashboard/ (same level as index.html).
 * Fill in the same config values as js/firebase-config.js.
 */

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey:            "REPLACE_WITH_YOUR_API_KEY",
    authDomain:        "smart-waste-management-s-6225c.firebaseapp.com",
    projectId:         "smart-waste-management-s-6225c",
    storageBucket:     "smart-waste-management-s-6225c.appspot.com",
    messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
    appId:             "REPLACE_WITH_YOUR_APP_ID",
});

const messaging = firebase.messaging();

// Background message handler — shown when the app tab is not in focus
messaging.onBackgroundMessage(payload => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || "SmartWaste", {
        body:  body || "",
        icon:  "/user-dashboard/favicon.ico",
        badge: "/user-dashboard/favicon.ico",
        data:  payload.data || {},
    });
});
