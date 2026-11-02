import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { imagePath } from "@/lib/vademecum";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Immagini del vademecum (anteprime dei file Excel, contengono nomi e targhe):
 * servite solo dietro login, mai da public/.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getSession();
  if (!user || !can(user, "vademecum.view")) return new NextResponse("Non autorizzato", { status: 403 });
  const { name } = await params;
  const file = imagePath(name);
  if (!file) return new NextResponse("Non trovata", { status: 404 });
  try {
    const data = await fs.readFile(file);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Non trovata", { status: 404 });
  }
}
