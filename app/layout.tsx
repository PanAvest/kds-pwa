import "./globals.css"
import type { Metadata } from "next"
import Header from "@/components/Header"
import { ToastHost } from "@/components/ui/toast"
import BottomTabs from "@/components/BottomTabs"

export const metadata: Metadata = {
  title: "KDS Learning",
  description: "Browse → Enroll → Learn → Assess → Certify",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/icon-192.png" }]
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[var(--color-bg)] text-[var(--color-text-dark)]">
        {/* Fills the notch / status-bar safe area with header color */}
        <div
          className="fixed inset-x-0 top-0 z-50 pointer-events-none"
          style={{
            height: "env(safe-area-inset-top)",
            background: "var(--color-bg)",
          }}
        />

        <Header />

        <main className="pb-16">
          {children}
        </main>

        <BottomTabs />
        <ToastHost />
      </body>
    </html>
  )
}
