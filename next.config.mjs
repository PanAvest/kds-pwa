// File: next.config.mjs
import withPWA from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache.js";

const isProd = process.env.NODE_ENV === "production";
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;
const runtimeCaching = defaultRuntimeCaching.filter(
  (entry) =>
    !["apis", "static-image-assets", "next-image"].includes(entry?.options?.cacheName)
);
const imageRuntimeCaching = {
  urlPattern: ({ request, url }) =>
    request.destination === "image" ||
    /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i.test(url.pathname) ||
    url.pathname === "/_next/image",
  handler: "CacheFirst",
  options: {
    cacheName: "image-assets",
    expiration: {
      maxEntries: 256,
      maxAgeSeconds: 30 * 24 * 60 * 60,
    },
    cacheableResponse: {
      statuses: [0, 200],
    },
  },
};
// Always pull fresh pages + React Server Component payloads when online, so a new
// deploy shows up immediately in the installed PWA / native (Capacitor) WebView.
// Falls back to cache only when offline.
const freshContentRuntimeCaching = {
  urlPattern: ({ request, url }) =>
    request.mode === "navigate" ||
    request.headers.get("RSC") === "1" ||
    url.searchParams.has("_rsc"),
  handler: "NetworkFirst",
  options: {
    cacheName: "pages",
    networkTimeoutSeconds: 6,
    expiration: {
      maxEntries: 64,
      maxAgeSeconds: 24 * 60 * 60,
    },
    cacheableResponse: {
      statuses: [0, 200],
    },
  },
};
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
  reloadOnOnline: false,
  skipWaiting: true,
  publicExcludes: [
    "!interactive/**/*",
    "!scmpedia_full*.csv",
    "!vendor/pdf.worker.min.mjs",
  ],
  runtimeCaching: [
    freshContentRuntimeCaching,  // pages/RSC: network-first (fresh deploys win)
    imageRuntimeCaching,
    ...runtimeCaching,
  ],                           // cache static assets for app-like speed
})(nextConfig);
