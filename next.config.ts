import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Disable compression so SSE events stream immediately without buffering
  compress: false,
};

export default nextConfig;
