import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile-time error on an invalid href instead of a silent runtime 404 --
  // cheap now while the route surface is tiny, compounds as it grows.
  typedRoutes: true,

  async redirects() {
    return [
      // /signup and /login merged into one code-gated flow (BUILD_PLAN.md
      // #35) -- old links/bookmarks still land somewhere useful.
      {
        source: "/signup",
        destination: "/login?intent=join",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
