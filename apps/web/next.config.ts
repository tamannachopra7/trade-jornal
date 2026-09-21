import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@luxalgo/journal-core", "@luxalgo/journal-importers"],
};

export default nextConfig;
