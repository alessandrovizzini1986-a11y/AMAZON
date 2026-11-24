import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // i file del Vademecum sono letti con fs a runtime: vanno inclusi nel bundle delle route
  outputFileTracingIncludes: {
    "/vademecum": ["./content/vademecum/**"],
    "/vademecum/[slug]": ["./content/vademecum/**"],
    "/api/vademecum/search-index": ["./content/vademecum/**"],
    "/vademecum/img/[name]": ["./content/vademecum/img/**"],
  },
  // pdf.js (fatture Amazon) gira solo nel browser: il modulo "canvas" di Node non serve
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias ?? {}), canvas: false };
    return config;
  },
  // sito privato: ogni risposta dice ai motori (di ricerca e di IA) di non indicizzare, non archiviare e non usare i contenuti
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" }] }];
  },
  experimental: {
    serverActions: {
      // gli import Excel/CSV possono superare il limite di default (1MB)
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
