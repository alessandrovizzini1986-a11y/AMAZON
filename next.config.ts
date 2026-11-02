import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // i file del Vademecum sono letti con fs a runtime: vanno inclusi nel bundle delle route
  outputFileTracingIncludes: {
    "/vademecum": ["./content/vademecum/**"],
    "/vademecum/[slug]": ["./content/vademecum/**"],
    "/api/vademecum/search-index": ["./content/vademecum/**"],
    "/vademecum/img/[name]": ["./content/vademecum/img/**"],
  },
  experimental: {
    serverActions: {
      // gli import Excel/CSV possono superare il limite di default (1MB)
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
