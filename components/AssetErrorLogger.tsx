"use client"

import { useEffect } from "react"

/**
 * Captures image load errors so we can see which asset is corrupt or missing
 * in Safari WebView / iOS. Logs failing URLs to the console.
 */
export default function AssetErrorLogger() {
  useEffect(() => {
    const handler = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      if (target.tagName === "IMG") {
        const img = target as HTMLImageElement
        // Log the failing URL to help track CRC/WEBP errors
        console.warn("[asset-error] image failed to load", {
          src: img.currentSrc || img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        })
      }
    }

    window.addEventListener("error", handler, true)
    return () => window.removeEventListener("error", handler, true)
  }, [])

  return null
}
