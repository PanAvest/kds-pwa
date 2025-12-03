"use client";

import type { ReactNode } from "react";
import ReadySignal from "../ReadySignal";
import LoadingOverlay from "@/components/LoadingOverlay";
import OfflineOverlay from "./OfflineOverlay";
import { useOfflineStatus } from "@/app/hooks/useOfflineStatus";
import { ToastHost } from "@/components/ui/toast";
import { isNativeApp } from "@/lib/nativePlatform";

type Props = { children: ReactNode };

export default function ClientShell({ children }: Props) {
  const { isOffline, retry } = useOfflineStatus();
  const native = isNativeApp();

  return (
    <>
      <ReadySignal />
      <LoadingOverlay />
      <main className={`min-h-[100dvh] ${native ? "pb-0" : "pb-4"}`}>
        {children}
      </main>
      <OfflineOverlay visible={isOffline} onRetry={retry} />
      <ToastHost />
    </>
  );
}
