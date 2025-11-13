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
    minimumScale: 1,
    userScalable: false, // disable pinch + double-tap zoom
    viewportFit: "cover", // fill iPhone safe areas like a real app
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* no-copy keeps the whole app non-selectable / non-copyable */}
      <body className="bg-[var(--color-bg)] no-copy">
        {/* Main content; mobile app will be inside native header + bottom bar */}
        <main className="min-h-[100dvh] pb-4">
          {children}
        </main>

        <ToastHost />

        <script
  dangerouslySetInnerHTML={{
    __html: `
      document.addEventListener("click", () => {
        if (navigator?.vibrate) navigator.vibrate(7);
      });
    `,
  }}
/>

      </body>
    </html>
  )
}
