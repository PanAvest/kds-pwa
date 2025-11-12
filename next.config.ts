import type { NextConfig } from "next"
import withPWAInit from "next-pwa"

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  fallbacks: {
    document: "/offline",
  },
})

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"]
  },
  images: {
    unoptimized: true
  }
}

export default withPWA(nextConfig)
