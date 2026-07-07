"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseImportFile } from "@/lib/importing/parse";
import { processRows } from "@/lib/importing/commit";
import { IMPORT_SPECS, autoMapColumns, validateRows } from "@/domain/importing";

export type PreviewIssue = { rowIndex: number; status: string; message: string };

export type PreviewResult = {
  headers: string[];
  mapping: Record<string, number | null>;
  totalRows: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  issues: PreviewIssue[]; // prime N righe problematiche con motivo
  error?: string;
};

async function parseAndValidate(entity: string, file: File, mappingJson?: string) {
  const spec = IMPORT_SPECS[entity];
  if (!spec) throw new Error(`Entità sconosciuta: ${entity}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseImportFile(file.name, buffer);
  const mapping = mappingJson
    ? (JSON.parse(mappingJson) as Record<string, number | null>)
    : autoMapColumns(parsed.headers, spec);
  const results = validateRows(parsed.rows, mapping, spec);
  return { spec, parsed, mapping, results };
}

export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  const user = await requireUser();
  assertCan(user, "import.run");
  try {
    const entity = String(formData.get("entity"));
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return emptyPreview("Nessun file caricato");
    const mappingJson = formData.get("mapping") ? String(formData.get("mapping")) : undefined;

    const { parsed, mapping, results } = await parseAndValidate(entity, file, mappingJson);

    // dry-run sul DB per FK e duplicati rispetto a dati già presenti
    const validRows = results.filter((r) => r.ok).map((r) => ({ rowIndex: r.rowIndex, data: r.data }));
    const outcomes = await processRows({ entity, rows: validRows, dryRun: true });

    const issues: PreviewIssue[] = [
      ...results.filter((r) => !r.ok).map((r) => ({ rowIndex: r.rowIndex, status: "error", message: r.errors.join("; ") })),
      ...outcomes.filter((o) => o.status !== "ok").map((o) => ({ rowIndex: o.rowIndex, status: o.status, message: o.message })),
    ].sort((a, b) => a.rowIndex - b.rowIndex);

    const duplicateCount = outcomes.filter((o) => o.status === "duplicate").length;
    const fkErrors = outcomes.filter((o) => o.status === "error").length;

    return {
      headers: parsed.headers,
      mapping,
      totalRows: results.length,
      validCount: results.filter((r) => r.ok).length - duplicateCount - fkErrors,
      errorCount: results.filter((r) => !r.ok).length + fkErrors,
      duplicateCount,
      issues: issues.slice(0, 100),
    };
  } catch (e) {
    return emptyPreview(e instanceof Error ? e.message : "Errore di analisi del file");
  }
}

function emptyPreview(error: string): PreviewResult {
  return { headers: [], mapping: {}, totalRows: 0, validCount: 0, errorCount: 0, duplicateCount: 0, issues: [], error };
}

export type CommitResult = {
  ok: boolean;
  message: string;
  imported: number;
  skipped: number;
  notes: string[]; // es. password temporanee generate per i driver
};

export async function commitImportAction(formData: FormData): Promise<CommitResult> {
  const user = await requireUser();
  assertCan(user, "import.run");
  const entity = String(formData.get("entity"));
  const file = formData.get("file") as File | null;
  const mode = String(formData.get("mode") ?? "partial"); // partial | strict
  if (!file || file.size === 0) {
    return { ok: false, message: "Nessun file caricato", imported: 0, skipped: 0, notes: [] };
  }

  try {
    const mappingJson = formData.get("mapping") ? String(formData.get("mapping")) : undefined;
    const { parsed, results } = await parseAndValidate(entity, file, mappingJson);

    const validRows = results.filter((r) => r.ok).map((r) => ({ rowIndex: r.rowIndex, data: r.data }));
    const formatErrors = results.filter((r) => !r.ok);

    // dry-run per FK/duplicati
    const dryOutcomes = await processRows({ entity, rows: validRows, dryRun: true });
    const dryBad = dryOutcomes.filter((o) => o.status !== "ok");

    if (mode === "strict" && (formatErrors.length > 0 || dryBad.length > 0)) {
      return {
        ok: false,
        message: `Import bloccato (modalità blocco totale): ${formatErrors.length + dryBad.length} righe con errori o duplicati su ${results.length}. Correggere il file e riprovare.`,
        imported: 0,
        skipped: results.length,
        notes: [],
      };
    }

    // commit delle sole righe pulite
    const badIndexes = new Set(dryBad.map((o) => o.rowIndex));
    const cleanRows = validRows.filter((r) => !badIndexes.has(r.rowIndex));

    const job = await db.importJob.create({
      data: {
        userId: user.id,
        entity,
        fileName: file.name,
        status: "COMPLETATO",
        totalRows: results.length,
        importedRows: 0,
        skippedRows: 0,
      },
    });

    const outcomes = await processRows({ entity, rows: cleanRows, dryRun: false, importJobId: job.id });
    const imported = outcomes.filter((o) => o.status === "ok").length;
    const skipped = results.length - imported;

    const errorLog = [
      ...formatErrors.map((r) => ({ row: r.rowIndex, error: r.errors.join("; ") })),
      ...dryBad.map((o) => ({ row: o.rowIndex, error: o.message })),
      ...outcomes.filter((o) => o.status !== "ok").map((o) => ({ row: o.rowIndex, error: o.message })),
    ];

    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: skipped === 0 ? "COMPLETATO" : imported === 0 ? "FALLITO" : "PARZIALE",
        importedRows: imported,
        skippedRows: skipped,
        errorLog,
      },
    });

    await audit({
      userId: user.id,
      action: "import.commit",
      entity: "ImportJob",
      entityId: job.id,
      meta: { entityType: entity, fileName: file.name, imported, skipped, mode },
    });

    revalidatePath("/import");

    // note operative (es. password temporanee driver) da comunicare all'admin
    const notes = outcomes
      .filter((o) => o.status === "ok" && o.message.startsWith("ok —"))
      .map((o) => `riga ${o.rowIndex}: ${o.message.replace("ok — ", "")}`);

    return {
      ok: true,
      message: `Import completato: ${imported} righe importate, ${skipped} scartate su ${results.length} totali.`,
      imported,
      skipped,
      notes,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Errore durante l'import",
      imported: 0,
      skipped: 0,
      notes: [],
    };
  }
}
