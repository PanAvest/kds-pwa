// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import { ToastHost } from "@/components/ui/toast"

export const metadata: Metadata = {
  title: "KDS Learning",
  description: "Browse → Enroll → Learn → Assess → Certify",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/icon-192.png" }],
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false, // disable zoom on inputs / pinch zoom
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[var(--color-bg)]">
        {/* Main content; mobile app will be inside native header + bottom bar */}
        <main className="min-h-[100dvh] pb-4">
          {children}
        </main>

        {/* No BottomTabs here – nav is handled natively in Xcode for the app */}
        <ToastHost />
      </body>
    </html>
  )
}
