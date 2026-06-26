import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are used by the auth flow.
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
};

export default nextConfig;
