import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, SourceNote, EmptyState } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; user?: string }>;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  const where = {
    ...(params.entity ? { entity: params.entity } : {}),
    ...(params.action ? { action: { contains: params.action } } : {}),
    ...(params.user ? { user: { email: { contains: params.user } } } : {}),
  };

  const [rows, entities] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.auditLog.groupBy({ by: ["entity"], _count: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit trail"
        subtitle="Chi ha fatto cosa, quando — ogni azione applicativa è registrata. Solo Admin."
      />

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <select className="input max-w-52" name="entity" defaultValue={params.entity ?? ""}>
          <option value="">Tutte le entità</option>
          {entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity} ({e._count})</option>)}
        </select>
        <input className="input max-w-52" name="action" placeholder="azione (es. fine.)" defaultValue={params.action ?? ""} />
        <input className="input max-w-52" name="user" placeholder="email utente" defaultValue={params.user ?? ""} />
        <button className="btn-secondary">Filtra</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState message="Nessuna riga di audit con questi filtri." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Entità</th><th>Dettagli</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</td>
                  <td className="text-xs">{r.user ? `${r.user.firstName} ${r.user.lastName}` : "sistema"}</td>
                  <td className="font-mono text-xs">{r.action}</td>
                  <td className="text-xs">{r.entity}{r.entityId ? <span className="text-ink-faint"> · {r.entityId.slice(0, 10)}…</span> : null}</td>
                  <td className="text-xs max-w-md truncate">{r.meta ? JSON.stringify(r.meta) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <SourceNote>tabella AuditLog — ultime 200 righe con i filtri correnti</SourceNote>
          </div>
        </div>
      )}
    </div>
  );
}
