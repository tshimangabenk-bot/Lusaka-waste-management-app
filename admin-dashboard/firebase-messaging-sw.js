/**
 * Firebase Cloud Messaging service worker — Admin Dashboard.
 * Handles background push notifications when the browser tab is not in focus.
 *
 * This file MUST live at the root of admin-dashboard/ (same level as index.html).
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

messaging.onBackgroundMessage(payload => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || "SmartWaste Admin", {
        body:  body || "",
        icon:  "/admin-dashboard/favicon.ico",
        badge: "/admin-dashboard/favicon.ico",
        tag:   payload.data?.alert_type || "swm-admin",
        data:  payload.data || {},
    });
});
