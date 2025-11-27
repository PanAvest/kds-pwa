"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { emitPaystackNativeVerified, verifyPaystackReference } from "@/lib/paystackNative";

const DEEP_LINK_SCHEME = "kdslearning:";
const DEEP_LINK_HOST = "paystack";
const DEEP_LINK_PATH = "/return";

export default function NativePaystackListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform?.()) return;

    const handler = App.addListener("appUrlOpen", async (event) => {
      try {
        const parsed = new URL(event.url);
        if (
          parsed.protocol !== DEEP_LINK_SCHEME ||
          parsed.host !== DEEP_LINK_HOST ||
          parsed.pathname !== DEEP_LINK_PATH
        ) {
          return;
        }

        const reference = parsed.searchParams.get("reference");
        if (!reference) return;

        const result = await verifyPaystackReference(reference);
        if (result.ok) {
          emitPaystackNativeVerified(result);
        }
      } catch (error) {
        console.error("Unable to process Paystack deep link", error);
      }
    });

    return () => {
      handler.remove();
    };
  }, []);

  return null;
}
