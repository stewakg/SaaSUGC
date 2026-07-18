/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages (they ship raw .ts).
  transpilePackages: ['@adgen/core', '@adgen/db'],
  // typedRoutes is off until /signup and /login exist (F1) to avoid breaking
  // the build on not-yet-created routes.
  // Allow placeholder/mock image hosts in next/image during dev.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'www.w3schools.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
};

export default nextConfig;