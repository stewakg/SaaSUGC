/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages (they ship raw .ts).
  transpilePackages: ['@adgen/core', '@adgen/db'],
  // youtube-dl-exec ships a real yt-dlp.exe and locates it RELATIVE TO ITS OWN
  // MODULE DIRECTORY. Bundling it rewrites that base to `.next/server`, so the
  // route spawns `.next/server/bin/yt-dlp.exe`, which does not exist — found
  // live 2026-08-10, as `502 search_failed` with stderr "The system cannot find
  // the path specified." Keeping it external makes it a plain runtime require
  // from node_modules, where the binary actually sits. Affects both routes that
  // shell out to yt-dlp: /api/search-clips and /api/import-clip.
  serverExternalPackages: ['youtube-dl-exec'],
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