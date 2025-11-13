import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import { ToastHost } from "@/components/ui/toast";
import BottomTabs from "@/components/BottomTabs";

export const metadata: Metadata = {
  title: "KDS Learning",
  description: "Browse → Enroll → Learn → Assess → Certify",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/icon-192.png" }]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* lock viewport so iOS doesn’t zoom/weird scale */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </head>
      <body className="bg-[var(--color-bg)] text-[var(--color-text-dark)]">
        <Header />
        {/* leave space for bottom tabs + safe area */}
        <main className="min-h-[100dvh] pb-[calc(64px+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <BottomTabs />
        <ToastHost />
      </body>
    </html>
  );
}
