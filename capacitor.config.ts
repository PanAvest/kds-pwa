import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kdslearning.app",
  appName: "KDS Learning",
  webDir: "out", // not used for remoteUrl, but keep it
  server: {
    url: process.env.NEXT_PUBLIC_APP_URL || "https://kds-pwa.vercel.app",
    cleartext: false,  // force HTTPS
    androidScheme: "https" // important
  },
  ios: {
    contentInset: "always"
  }
};

export default config;
