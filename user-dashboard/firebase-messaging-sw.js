importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey:            "AIzaSyCntOyLC7GS7VOuNDhnOxzRbARP12GubgE",
    authDomain:        "lusaka-waste-management.firebaseapp.com",
    projectId:         "lusaka-waste-management",
    storageBucket:     "lusaka-waste-management.firebasestorage.app",
    messagingSenderId: "147528803192",
    appId:             "1:147528803192:web:5ec1e1a6348221d1009e8d",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || "SmartWaste", {
        body:  body || "",
        icon:  "/user-dashboard/favicon.ico",
        badge: "/user-dashboard/favicon.ico",
        data:  payload.data || {},
    });
});
