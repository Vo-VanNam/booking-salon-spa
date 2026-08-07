import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production: build ra .next/standalone de chay trong Docker khong can node_modules day du
  output: "standalone",
  // Rewrite CHI co tac dung khi request /api/* toi chinh Next server (dev).
  // O production, Nginx proxy /api/* sang backend truoc khi toi Next nen rewrite
  // khong bao gio chay - giu nguyen de khong lam doi luong dev dang chay.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
