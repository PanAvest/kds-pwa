import withPWA from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: (() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return {};
    let hostname = "";
    try {
      hostname = new URL(supabaseUrl).hostname;
    } catch {
      return {};
    }
    return {
      remotePatterns: [
        {
          protocol: "https",
          hostname,
          pathname: "/storage/v1/object/**",
        },
      ],
    };
  })(),
};

export default withPWA({
  dest: "public",
  disable: !isProd,           // keep dev fast, enable PWA in prod
  register: true,
  skipWaiting: true,
  runtimeCaching,             // cache static assets for app-like speed
})(nextConfig);
