import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/server/security-headers';

const nextConfig: NextConfig = {
  // The shared engine is TypeScript source in the npm workspace; Next compiles it with the app.
  transpilePackages: ['@app/backend'],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: Object.entries(STATIC_SECURITY_HEADERS).map(([key, value]) => ({ key, value })) }];
  },
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
