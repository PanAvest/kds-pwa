"use client"
// File: app/notifications/page.tsx
import React from "react"
import { Button } from "@/components/ui/button"
import { pushToast } from "@/components/ui/toast"

declare global {
  interface Window { FirebaseInitialized?: boolean }
}

async function ensureFCM(){
  const { initializeApp } = await import("firebase/app")
  const { getMessaging, getToken, onMessage } = await import("firebase/messaging")
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  })
  const messaging = getMessaging(app)
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register("/firebase-messaging-sw.js") })
  return { token }
}

export default function NotificationsPage(){
  const pushAvailable = process.env.NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === "true"
  const [enabled,setEnabled]=React.useState(false)
  async function enable(){
    if (!pushAvailable) {
      pushToast("Notifications are not available in this release")
      return
    }
    try{
      const perm = await Notification.requestPermission()
      if(perm !== "granted"){ pushToast("Permission denied"); return }
      const { token } = await ensureFCM()
      await fetch("/api/push/subscribe", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ token }) })
      setEnabled(true)
      pushToast("Notifications enabled")
    }catch(e:any){ pushToast(e.message || "Failed to enable") }
  }
  async function test(){
    if (!pushAvailable) {
      pushToast("Notifications are not available in this release")
      return
    }
    await fetch("/api/push/test", { method:"POST" })
    pushToast("Test notification requested")
  }
  return <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
    <h1 className="text-xl font-semibold">Web Push Notifications</h1>
    {pushAvailable ? (
      <>
        <p className="text-[var(--color-text-muted)]">Enable push notifications to receive course updates.</p>
        <div className="flex gap-2">
          <Button onClick={enable} disabled={enabled}>{enabled?"Enabled":"Enable Notifications"}</Button>
          <Button variant="outline" onClick={test}>Send Test</Button>
        </div>
      </>
    ) : (
      <div className="rounded-xl border border-[color:var(--color-light)] bg-white p-4 text-sm text-[var(--color-text-muted)]">
        Notifications are disabled for this launch build. Remove the UI only after the backend, web service worker,
        APNs, and FCM configuration are fully implemented end to end.
      </div>
    )}
  </div>
}
