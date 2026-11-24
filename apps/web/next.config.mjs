import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Raíz del monorepo: el build standalone incluye los paquetes del workspace (#35)
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  transpilePackages: ['@salud-digna/shared', '@salud-digna/ui'],
  reactStrictMode: true,
};

export default nextConfig;
