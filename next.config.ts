import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // gli import Excel/CSV possono superare il limite di default (1MB)
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
