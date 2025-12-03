// Client-safe helpers to detect Capacitor + iOS without breaking SSR

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-ignore Capacitor injected at runtime inside the native shell
  const cap = (window as any).Capacitor || null;
  return !!cap?.isNativePlatform;
}

export function isNativeIOSApp(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-ignore Capacitor injected at runtime inside the native shell
  const cap = (window as any).Capacitor || null;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return !!cap?.isNativePlatform && /iPhone|iPad|iPod/i.test(ua);
}
