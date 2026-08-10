import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker runtime image carries only the traced
  // subset of node_modules instead of a full production install.
  output: "standalone",
};

export default nextConfig;
