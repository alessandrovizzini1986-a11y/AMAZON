import type { MetadataRoute } from "next";

/**
 * Web App Manifest — permette "Aggiungi a schermata Home" su Android Chrome
 * con icona e nome corretti (invece dello screenshot generico della pagina).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FleetDSP — Gestionale Flotta",
    short_name: "FleetDSP",
    description: "Gestionale flotta veicoli commerciali per operatori logistici DSP",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f4c81",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
