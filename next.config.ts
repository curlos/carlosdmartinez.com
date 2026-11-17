import type { NextConfig } from "next";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Only the widths the layouts actually need (cards, feature grid, top media, lightbox),
    // to stay well under Vercel Hobby's 5,000 transformations a month.
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [384],
    qualities: [75],
    minimumCacheTTL: THIRTY_DAYS,
  },
  async headers() {
    // Safe to cache long: the pages link these with a content hash (src/lib/versioned.ts).
    const cache = [{ key: "Cache-Control", value: `public, max-age=${THIRTY_DAYS}` }];
    return [
      { source: "/videos/:path*", headers: cache },
      { source: "/posters/:path*", headers: cache },
      // Opens in the browser; saves as a readable file name.
      {
        source: "/resume.pdf",
        headers: [{ key: "Content-Disposition", value: 'inline; filename="Carlos-Martinez-Resume.pdf"' }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
