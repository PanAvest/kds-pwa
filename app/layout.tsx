// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import ClientShell from "./components/ClientShell"
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  title: "KDS Learning",
  description: "Browse → Enroll → Learn → Assess → Certify",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/icon-192.png" }],
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    minimumScale: 1,
    userScalable: false,   // disable zoom on inputs / pinch zoom
    viewportFit: "cover",  // fill iPhone safe areas like a real app
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* no-copy keeps whole app non-selectable / non-copyable (set in globals.css) */}
      <body className="bg-[var(--color-bg)] no-copy">
        <ClientShell>
          {children}
        </ClientShell>
        <Analytics />
      </body>
    </html>
  )
}
