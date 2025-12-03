"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const hasWindow = () => typeof window !== "undefined";

const getInitial = () => {
  if (!hasWindow()) return false;
  return window.navigator.onLine === false;
};

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState<boolean>(getInitial);

  useEffect(() => {
    if (!hasWindow()) return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleCapacitorOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("capacitorOffline", handleCapacitorOffline as EventListener);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("capacitorOffline", handleCapacitorOffline as EventListener);
    };
  }, []);

  const retry = useCallback(() => {
    if (!hasWindow()) return;
    if (navigator.onLine) {
      window.location.reload();
    } else {
      setIsOffline(true);
    }
  }, []);

  return useMemo(() => ({ isOffline, retry }), [isOffline, retry]);
}
