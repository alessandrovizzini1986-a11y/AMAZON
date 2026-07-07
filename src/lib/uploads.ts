import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** Salva una foto (check-in/out, danni) e ritorna il path relativo servito da /api/uploads. */
export async function saveUpload(file: File, prefix: string): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name || ".jpg").toLowerCase() || ".jpg";
  const safe = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, safe), Buffer.from(await file.arrayBuffer()));
  return safe;
}

export async function readUpload(name: string): Promise<Buffer | null> {
  // difesa path traversal: solo basename
  const safe = path.basename(name);
  try {
    return await fs.readFile(path.join(UPLOAD_DIR, safe));
  } catch {
    return null;
  }
}
