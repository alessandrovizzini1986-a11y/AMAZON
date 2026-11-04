/**
 * Cifratura delle password dei portali (AES-256-GCM). La chiave sta solo sul server:
 * CREDENZIALI_KEY se c'è, altrimenti derivata da AUTH_SECRET (HKDF). Se si cambia la chiave
 * le password salvate non si leggono più e vanno reinserite.
 */
import crypto from "node:crypto";

function chiave(): Buffer {
  const base = process.env.CREDENZIALI_KEY || process.env.AUTH_SECRET;
  if (!base) throw new Error("Chiave mancante: imposta CREDENZIALI_KEY o AUTH_SECRET");
  return Buffer.from(crypto.hkdfSync("sha256", base, "fleetdsp-portali", "credenziali-v1", 32));
}

/** "v1:iv:tag:dati" in base64url. */
export function cifra(testo: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chiave(), iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), dati].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(":");
}

export function decifra(s: string): string {
  const [v, iv, tag, dati] = s.split(":");
  if (v !== "v1" || !iv || !tag || dati === undefined) throw new Error("formato non valido");
  const d = crypto.createDecipheriv("aes-256-gcm", chiave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dati, "base64url")), d.final()]).toString("utf8");
}
