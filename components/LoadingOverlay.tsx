// components/LoadingOverlay.tsx
"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

/**
 * Global loading overlay:
 * - Fades in when:
 *    • any <form> is submitted
 *    • any element with [data-kds-loading] is tapped/clicked
 * - Fades out when route/pathname changes
 * - Has a semi-transparent light background + spinner
 * - Mimics the native iOS MainViewController loading overlay
 */
export default function LoadingOverlay() {
  const [active, setActive] = useState(false)
  const pathname = usePathname()

  // Auto-hide when the route/pathname changes (navigation finished)
  useEffect(() => {
    if (!active) return
    const timeout = setTimeout(() => setActive(false), 800) // safety fallback
    return () => clearTimeout(timeout)
  }, [active])

  useEffect(() => {
    // Whenever path changes, hide overlay
    setActive(false)
  }, [pathname])

  // Show overlay on:
  //  - any form submit
  //  - any click on element with [data-kds-loading]
  useEffect(() => {
    const handleSubmit = () => {
      setActive(true)
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      // Only trigger when something explicitly marked as "loading navigation"
      const trigger = target.closest("[data-kds-loading]") as HTMLElement | null
      if (!trigger) return

      setActive(true)
    }

    window.addEventListener("submit", handleSubmit, true)
    window.addEventListener("click", handleClick, true)

    return () => {
      window.removeEventListener("submit", handleSubmit, true)
      window.removeEventListener("click", handleClick, true)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[80] flex items-center justify-center transition-opacity duration-200 ${
        active ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      // same vibe as your iOS overlay: soft light fade over content
      style={{ backgroundColor: "rgba(254, 253, 250, 0.7)" }} // #fefdfa with alpha
    >
      {/* Spinner (matches accentRed) */}
      <div className="h-10 w-10 rounded-full border-2 border-[var(--color-accent-red)] border-t-transparent animate-spin" />
    </div>
  )
}
