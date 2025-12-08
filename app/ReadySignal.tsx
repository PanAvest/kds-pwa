"use client"
// File: app/ReadySignal.tsx

import { useEffect } from "react"

export default function ReadySignal() {
  useEffect(() => {
    if (typeof window === "undefined") return
    ;(window as any).__KDS_WEB_READY = true
    window.dispatchEvent(new Event("kdsWebReady"))
  }, [])

  return null
}
