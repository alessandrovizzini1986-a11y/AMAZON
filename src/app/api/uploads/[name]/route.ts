import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readUpload } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  await requireUser();
  const { name } = await params;
  const buf = await readUpload(name);
  if (!buf) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  const ct = name.endsWith(".png") ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": ct } });
}
