import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, SourceNote, EmptyState } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtKm } from "@/lib/format";
import { createAssignmentAction, requestTransferAction, resolveTransferAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = stationScope(user);
  const canManage = can(user, "vehicle.manage");
  const isAdmin = user.role === "ADMIN";

  const date = params.date ? new Date(params.date) : new Date();
  date.setHours(0, 0, 0, 0);

  const [assignments, vehicles, drivers, stations, pendingTransfers, recentTransfers] = await Promise.all([
    db.assignment.findMany({
      where: { date, ...(scope.stationId ? { stationId: scope.stationId } : {}) },
      include: { vehicle: true, driver: true, station: true },
      orderBy: [{ station: { code: "asc" } }, { vehicle: { targa: "asc" } }],
    }),
    canManage
      ? db.vehicle.findMany({
          where: { ...(scope.stationId ? { stationId: scope.stationId } : {}), stato: "ATTIVO" },
          orderBy: { targa: "asc" },
          select: { id: true, targa: true, modello: true },
        })
      : Promise.resolve([]),
    canManage
      ? db.user.findMany({
          where: { role: "DRIVER", active: true, ...(scope.stationId ? { stationId: scope.stationId } : {}) },
          orderBy: { lastName: "asc" },
        })
      : Promise.resolve([]),
    db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    isAdmin
      ? db.stationTransfer.findMany({
          where: { status: "RICHIESTO" },
          include: { vehicle: true, fromStation: true, toStation: true, requestedBy: true },
          orderBy: { requestedAt: "asc" },
        })
      : Promise.resolve([]),
    db.stationTransfer.findMany({
      where: scope.stationId ? { OR: [{ fromStationId: scope.stationId }, { toStationId: scope.stationId }] } : {},
      include: { vehicle: true, fromStation: true, toStation: true },
      orderBy: { requestedAt: "desc" },
      take: 10,
    }),
  ]);

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Movimentazione mezzi"
        subtitle="Assegnazioni giornaliere veicolo ↔ driver e trasferimenti tra stazioni del cluster"
      />

      {params.error && (
        <p className="mb-4 text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{params.error}</p>
      )}

      {/* selettore data */}
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input className="input max-w-44" type="date" name="date" defaultValue={date.toISOString().slice(0, 10)} />
        <button className="btn-secondary">Mostra giorno</button>
      </form>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="card p-5 xl:col-span-2">
          <h2 className="font-semibold mb-3">Assegnazioni del {fmtDate(date)}</h2>
          {assignments.length === 0 ? (
            <EmptyState message="Nessuna assegnazione per questa data." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Targa</th><th>Driver</th><th>Stazione</th><th>Check-in</th><th>Check-out</th><th>Stato</th></tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <td><Link href={`/vehicles/${a.vehicleId}`} className="font-mono font-semibold text-brand hover:underline">{a.vehicle.targa}</Link></td>
                      <td>{a.driver.firstName} {a.driver.lastName}</td>
                      <td>{a.station.code}</td>
                      <td className="text-xs whitespace-nowrap">
                        {a.checkInAt ? <>{fmtDateTime(a.checkInAt)}<br />{fmtKm(a.checkInKm)}{a.checkInFoto && <> · <a className="text-brand underline" href={`/api/uploads/${a.checkInFoto}`} target="_blank">foto</a></>}</> : "—"}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        {a.checkOutAt ? <>{fmtDateTime(a.checkOutAt)}<br />{fmtKm(a.checkOutKm)}{a.checkOutFoto && <> · <a className="text-brand underline" href={`/api/uploads/${a.checkOutFoto}`} target="_blank">foto</a></>}</> : "—"}
                      </td>
                      <td>
                        {a.danniRilevati ? (
                          <StatusBadge tone="danger">danni: {a.danniRilevati}</StatusBadge>
                        ) : a.checkOutAt ? (
                          <StatusBadge tone="ok">chiusa</StatusBadge>
                        ) : a.checkInAt ? (
                          <StatusBadge tone="info">in servizio</StatusBadge>
                        ) : (
                          <StatusBadge tone="warn">da ritirare</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SourceNote>tabella Assignment, data={date.toISOString().slice(0, 10)}{scope.stationId ? ", propria stazione" : ", cluster"}</SourceNote>
            </div>
          )}
        </section>

        {canManage && (
          <section className="card p-5 space-y-4">
            <h2 className="font-semibold">Nuova assegnazione</h2>
            <form action={createAssignmentAction} className="space-y-3">
              <div>
                <label className="label">Data</label>
                <input className="input" type="date" name="date" defaultValue={todayISO} required />
              </div>
              <div>
                <label className="label">Veicolo</label>
                <select className="input font-mono" name="vehicleId" required defaultValue="">
                  <option value="" disabled>— seleziona —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.targa} — {v.modello}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Driver</label>
                <select className="input" name="driverId" required defaultValue="">
                  <option value="" disabled>— seleziona —</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.lastName} {d.firstName}</option>)}
                </select>
              </div>
              <button className="btn-primary w-full">Assegna mezzo</button>
            </form>

            <div className="border-t border-line pt-4">
              <h2 className="font-semibold mb-2">Trasferimento tra stazioni</h2>
              <p className="text-xs text-ink-muted mb-3">
                {isAdmin ? "Come Admin il trasferimento è immediato." : "La richiesta cross-stazione richiede approvazione Admin."}
              </p>
              <form action={requestTransferAction} className="space-y-3">
                <select className="input font-mono" name="vehicleId" required defaultValue="">
                  <option value="" disabled>— veicolo —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.targa}</option>)}
                </select>
                <select className="input" name="toStationId" required defaultValue="">
                  <option value="" disabled>— stazione destinazione —</option>
                  {stations.filter((s) => s.id !== scope.stationId).map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
                <input className="input" name="motivo" placeholder="Motivo (es. copertura picco volumi)" />
                <button className="btn-secondary w-full">Richiedi trasferimento</button>
              </form>
            </div>
          </section>
        )}
      </div>

      {/* approvazioni pendenti (solo admin) */}
      {isAdmin && pendingTransfers.length > 0 && (
        <section className="card p-5 mt-6 border-warn">
          <h2 className="font-semibold mb-3">Trasferimenti da approvare ({pendingTransfers.length})</h2>
          <div className="space-y-3">
            {pendingTransfers.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
                <span className="font-mono font-semibold">{t.vehicle.targa}</span>
                <span className="text-sm">{t.fromStation.code} → {t.toStation.code}</span>
                <span className="text-xs text-ink-muted">richiesto da {t.requestedBy.firstName} {t.requestedBy.lastName} il {fmtDate(t.requestedAt)}</span>
                {t.motivo && <span className="text-xs bg-surface-sunken rounded px-2 py-0.5">{t.motivo}</span>}
                <div className="flex gap-2 ml-auto">
                  <form action={resolveTransferAction.bind(null, t.id)}>
                    <input type="hidden" name="decision" value="approve" />
                    <button className="btn-primary py-1.5 px-3 text-xs">Approva</button>
                  </form>
                  <form action={resolveTransferAction.bind(null, t.id)}>
                    <input type="hidden" name="decision" value="reject" />
                    <button className="btn-danger py-1.5 px-3 text-xs">Rifiuta</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* storico trasferimenti */}
      <section className="card p-5 mt-6">
        <h2 className="font-semibold mb-3">Ultimi trasferimenti tra stazioni</h2>
        {recentTransfers.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessun trasferimento registrato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Targa</th><th>Da</th><th>A</th><th>Richiesto</th><th>Stato</th></tr></thead>
              <tbody>
                {recentTransfers.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono">{t.vehicle.targa}</td>
                    <td>{t.fromStation.code}</td>
                    <td>{t.toStation.code}</td>
                    <td>{fmtDate(t.requestedAt)}</td>
                    <td>
                      <StatusBadge tone={t.status === "COMPLETATO" ? "ok" : t.status === "RIFIUTATO" ? "danger" : "warn"}>
                        {t.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SourceNote>tabella StationTransfer — ultime 10 righe</SourceNote>
          </div>
        )}
      </section>
    </div>
  );
}
