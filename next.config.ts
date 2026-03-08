import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let Next.js know faiss-node is a native Node.js package (C++ Addon)
  // so it doesn't get bundled by Turbopack or Webpack
  serverExternalPackages: ['faiss-node'],
};

export default nextConfig;
