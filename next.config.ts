import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile-time error on an invalid href instead of a silent runtime 404 --
  // cheap now while the route surface is tiny, compounds as it grows.
  typedRoutes: true,
};

export default nextConfig;
