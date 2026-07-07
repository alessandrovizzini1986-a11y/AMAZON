import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { IMPORT_SPECS } from "@/domain/importing";
import { PageHeader, SourceNote } from "@/components/ui";
import { StatusBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { ImportWizard } from "./ImportWizard";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("ADMIN");

  const jobs = await db.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const specs = Object.values(IMPORT_SPECS).map((s) => ({
    entity: s.entity,
    label: s.label,
    description: s.description,
    fields: s.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })),
  }));

  return (
    <div>
      <PageHeader
        title="Import massivo dati"
        subtitle="Caricamento iniziale da Excel/CSV: template, anteprima con validazione, import controllato. Solo Admin."
      />
      <ImportWizard specs={specs} />

      <section className="card p-5 mt-6">
        <h2 className="font-semibold mb-3">Storico import (audit)</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessun import eseguito finora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Data</th><th>Chi</th><th>Entità</th><th>File</th>
                  <th>Esito</th><th>Importate</th><th>Scartate</th><th>Errori</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const errors = (j.errorLog as { row: number; error: string }[] | null) ?? [];
                  return (
                    <tr key={j.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(j.createdAt)}</td>
                      <td>{j.user.firstName} {j.user.lastName}</td>
                      <td>{IMPORT_SPECS[j.entity]?.label ?? j.entity}</td>
                      <td className="font-mono text-xs">{j.fileName}</td>
                      <td>
                        <StatusBadge tone={j.status === "COMPLETATO" ? "ok" : j.status === "PARZIALE" ? "warn" : "danger"}>
                          {j.status}
                        </StatusBadge>
                      </td>
                      <td>{j.importedRows}/{j.totalRows}</td>
                      <td>{j.skippedRows}</td>
                      <td className="max-w-md">
                        {errors.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-xs text-ink-muted">{errors.length} errori</summary>
                            <ul className="text-xs mt-1 space-y-0.5">
                              {errors.slice(0, 20).map((e, i) => (
                                <li key={i}><span className="font-mono">riga {e.row}</span>: {e.error}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SourceNote>tabella ImportJob — ultimi 30 job, ordinati per data decrescente</SourceNote>
          </div>
        )}
      </section>
    </div>
  );
}
