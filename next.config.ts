import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Use webpack for production builds (Turbopack has issues with native modules)
  // Dev mode uses Turbopack by default and handles better-sqlite3 fine
};

export default nextConfig;
