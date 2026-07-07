import type { Metadata, Viewport } from "next";
import "./globals.css";

// Base assoluta richiesta perché le immagini di metadata (opengraph-image, icone)
// vengano risolte con URL assoluti nei link condivisi su WhatsApp/LinkedIn/ecc.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://amazon-alpha-khaki.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "FleetDSP — Gestionale Flotta",
  description: "Gestionale flotta veicoli commerciali per operatori logistici DSP",
  openGraph: {
    title: "FleetDSP — Gestionale Flotta",
    description: "Gestionale flotta veicoli commerciali per operatori logistici DSP. 7 stazioni, una sola fonte di verità.",
    siteName: "FleetDSP",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FleetDSP — Gestionale Flotta",
    description: "Gestionale flotta veicoli commerciali per operatori logistici DSP.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f4c81",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
