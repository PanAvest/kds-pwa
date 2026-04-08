// File: next.config.mjs
import withPWA from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache.js";

const isProd = process.env.NODE_ENV === "production";
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;
const runtimeCaching = defaultRuntimeCaching.filter(
  (entry) => entry?.options?.cacheName !== "apis"
);
const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // External Supabase image URLs are already optimized enough for this app.
    // Disabling Next's optimizer avoids intermittent /_next/image 500s in PWA/mobile contexts.
    unoptimized: true,
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withPWA({
  dest: "public",
  disable: !isProd,           // keep dev fast, enable PWA in prod
  register: true,
  skipWaiting: true,
  runtimeCaching,             // cache static assets for app-like speed
})(nextConfig);
