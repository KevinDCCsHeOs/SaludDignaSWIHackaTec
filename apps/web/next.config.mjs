/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@salud-digna/shared', '@salud-digna/ui'],
  reactStrictMode: true,
};

export default nextConfig;
