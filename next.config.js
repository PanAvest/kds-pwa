/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',           // enables `next export`
  images: { unoptimized: true } // avoid next/image optimizer
}
module.exports = nextConfig

