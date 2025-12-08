"use client";
// File: components/NoInternet.tsx

import { useCallback, useEffect, useMemo, useState } from "react";

export function useOfflineMonitor() {
  const initial = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return navigator.onLine === false;
  }, []);
  const [isOffline, setIsOffline] = useState<boolean>(initial);

  const markOffline = useCallback(() => setIsOffline(true), []);
  const markOnline = useCallback(() => setIsOffline(false), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    setIsOffline(navigator.onLine === false);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return { isOffline, markOffline, markOnline };
}

type NoInternetProps = {
  children?: React.ReactNode;
  forceOffline?: boolean;
};

export default function NoInternet({ children, forceOffline }: NoInternetProps) {
  const monitor = useOfflineMonitor();
  const offline = forceOffline ?? monitor.isOffline;

  if (offline) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white px-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">No Internet Connection</h1>
          <p className="text-[color:var(--color-text-muted)]">
            Please reconnect to the internet to load your KDS Learning content.
          </p>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            Once you’re online, all your previously added books and knowledge materials will appear automatically.
          </p>
        </div>
      </div>
    );
  }

  return <>{children ?? null}</>;
}
