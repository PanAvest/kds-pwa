import withPWAInit from "next-pwa";

/** @type {import('next').NextConfig} */
const baseConfig = {
  // Build settings
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // IMPORTANT: NOT 'export'. Standalone lets Vercel build serverless bundles.
  output: "standalone",

  // Keep your alias (optional)
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), "@": process.cwd() };
    return config;
  },
};

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

export default withPWA(baseConfig);
