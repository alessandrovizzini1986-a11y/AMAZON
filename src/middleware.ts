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
  // scarico notturno della telematica: lo chiama Vercel senza sessione (vedi la route: fa solo uno scarico che manca)
  "/api/telematica/cron",
];

/** prosegue passando il percorso richiesto: serve a requireUser per bloccare le pagine nascoste a quell'utente */
function avanti(req: NextRequest) {
  const h = new Headers(req.headers);
  h.set("x-percorso", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: h } });
}

export async function middleware(req: NextRequest) {
  // modalità accesso libero per il pilot in solitaria — vedi src/lib/auth.ts
  // disattivata a livello di codice in produzione: non basta dimenticare di
  // togliere la variabile, l'app resta protetta comunque
  if (process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") return avanti(req);

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
    return avanti(req);
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
