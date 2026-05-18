importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey:            "AIzaSyB2a2Ujs89NelznCuZvS5I9XhCWCk3J6r8",
    authDomain:        "smart-waste-management-s-6225c.firebaseapp.com",
    projectId:         "smart-waste-management-s-6225c",
    storageBucket:     "smart-waste-management-s-6225c.firebasestorage.app",
    messagingSenderId: "202624977732",
    appId:             "1:202624977732:web:82f47e768715464d332511",
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
