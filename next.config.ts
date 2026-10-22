import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // The E2E server builds into its own folder so it can run beside `npm run dev` without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
