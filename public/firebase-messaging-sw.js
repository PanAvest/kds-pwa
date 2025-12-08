// File: public/firebase-messaging-sw.js
/* Firebase messaging service worker */
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: self.location.search.includes('k=') ? "" : "",
  messagingSenderId: ""
})

const messaging = firebase.messaging()

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/notifications'))
})
