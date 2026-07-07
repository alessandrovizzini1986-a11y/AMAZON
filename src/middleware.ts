import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Percorsi pubblici: pagina login + asset che devono restare raggiungibili
// SENZA sessione (favicon, icona PWA, immagine Open Graph, manifest) — browser,
// crawler di WhatsApp/LinkedIn e Android li richiedono senza alcun cookie.
const PUBLIC_PATHS = [
  "/login",
  "/icon.png",
  "/apple-icon.png",
  "/opengraph-image.png",
  "/manifest.webmanifest",
  "/icons/",
];

export async function middleware(req: NextRequest) {
  // modalità accesso libero per il pilot in solitaria — vedi src/lib/auth.ts
  if (process.env.AUTH_BYPASS === "true") return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }
  const token = req.cookies.get("fleet_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("fleet_session");
    return res;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|design|icon.png|apple-icon.png|opengraph-image.png|manifest.webmanifest|icons/).*)",
  ],
};
