import { Capacitor } from "@capacitor/core";

export const isNative = (): boolean =>
  typeof window !== "undefined" && Boolean(Capacitor.isNativePlatform?.());
