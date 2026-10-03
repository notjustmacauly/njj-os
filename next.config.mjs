/** @type {import('next').NextConfig} */
const nextConfig = {
  // typedRoutes was breaking the build because the sidebar links to
  // /dashboard/orders etc. which don't exist as page files yet.
  // Re-enable in Phase 2b once all referenced routes have page.tsx files.
  images: {
    // Event cover images live in the public Supabase `event-images` bucket.
    remotePatterns: [
      { protocol: "https", hostname: "hatqqguxdezdhlocffqc.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;
