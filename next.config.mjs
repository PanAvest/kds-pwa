/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), '@': process.cwd() };
    return config;
  },
};
export default nextConfig;
