// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import Header from "@/components/Header"
import { ToastHost } from "@/components/ui/toast"

export const metadata: Metadata = {
  title: "KDS Learning",
  description: "Browse → Enroll → Learn → Assess → Certify",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/icon-192.png" }]
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Web header (still fine for browser / PWA) */}
        <Header />

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
