import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { buildXlsxTemplate, buildCsvTemplate } from "@/lib/importing/template";
import { IMPORT_SPECS } from "@/domain/importing";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const user = await requireUser();
  assertCan(user, "import.run");
  const { entity } = await params;
  if (!IMPORT_SPECS[entity]) {
    return NextResponse.json({ error: "Entità sconosciuta" }, { status: 404 });
  }
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";

  if (format === "csv") {
    return new NextResponse(buildCsvTemplate(entity), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="template_${entity}.csv"`,
      },
    });
  }
  const buf = await buildXlsxTemplate(entity);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template_${entity}.xlsx"`,
    },
  });
}
