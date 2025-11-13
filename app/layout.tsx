import "./globals.css"
import type { Metadata } from "next"
import Header from "@/components/Header"
import { ToastHost } from "@/components/ui/toast"
import BottomTabs from "@/components/BottomTabs"

export const metadata: Metadata = {
  title: "KDS Learning",
  description: "Browse → Enroll → Learn → Assess → Certify",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/icon-192.png" }],
  themeColor: [
    // Use the same light background for all modes
    { media: "(prefers-color-scheme: light)", color: "#fefdfa" },
    { media: "(prefers-color-scheme: dark)", color: "#fefdfa" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KDS Learning",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="min-h-[calc(100dvh-56px)] pb-16">{children}</main>
        <BottomTabs />
        <ToastHost />
      </body>
    </html>
  )
}
