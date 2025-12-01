import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

export function isIOSApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const platform = Capacitor.getPlatform?.() ?? "";
    return isNativeApp() && platform === "ios";
  } catch {
    return false;
  }
}
