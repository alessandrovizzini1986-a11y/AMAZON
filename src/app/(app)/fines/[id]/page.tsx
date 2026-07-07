import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, SourceNote } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";
import { giorniAllaScadenza } from "@/domain/fines";
import { FINE_TONE, RICORSO_LABELS, RIADDEBITO_LABELS } from "../constants";
import { notifyFineAction, assignFineDriverAction, updateFineStatusAction, chargebackFineAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function FineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const fine = await db.fine.findUnique({
    where: { id },
    include: { vehicle: { include: { station: true } }, driver: true },
  });
  if (!fine) notFound();

  // scoping visibilità
  if (user.role === "DRIVER" && fine.driverId !== user.id) notFound();
  if (user.role === "RESP_MEZZI" && fine.vehicle.stationId !== user.stationId) notFound();

  const canManage = can(user, "fine.manage");
  const oggi = new Date();
  const giorniRicorso = fine.scadenzaRicorso ? giorniAllaScadenza(fine.scadenzaRicorso, oggi) : null;

  const drivers = canManage
    ? await db.user.findMany({
        where: { role: "DRIVER", active: true, ...(user.role === "RESP_MEZZI" ? { stationId: user.stationId } : {}) },
        orderBy: { lastName: "asc" },
      })
    : [];

  // audit trail della multa (tracciabilità totale)
  const auditRows = canManage
    ? await db.auditLog.findMany({
        where: { entity: "Fine", entityId: id },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Multa ${fine.verbaleNo ?? ""} — ${fine.vehicle.targa}`}
        subtitle={`${fine.tipoViolazione} · ${fine.luogo}`}
        action={<StatusBadge tone={FINE_TONE[fine.stato]}>{fine.stato.replaceAll("_", " ")}</StatusBadge>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="card p-5 space-y-3 text-sm">
          <h2 className="font-semibold">Dettagli verbale</h2>
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-ink-muted">Data/ora infrazione</dt><dd>{fmtDateTime(fine.dataOraInfrazione)}</dd>
            <dt className="text-ink-muted">Veicolo</dt>
            <dd><Link className="text-brand hover:underline font-mono" href={`/vehicles/${fine.vehicleId}`}>{fine.vehicle.targa}</Link> ({fine.vehicle.station.code})</dd>
            <dt className="text-ink-muted">Importo</dt><dd className="font-semibold">{fmtEur(Number(fine.importo))}</dd>
            <dt className="text-ink-muted">Punti patente</dt><dd>{fine.puntiPatente || "—"}</dd>
            <dt className="text-ink-muted">Notificata il</dt><dd>{fmtDate(fine.dataNotifica)}</dd>
            <dt className="text-ink-muted">Scadenza ricorso</dt>
            <dd>
              {fine.scadenzaRicorso ? (
                <>
                  {fmtDate(fine.scadenzaRicorso)}{" "}
                  {giorniRicorso !== null && (
                    <StatusBadge tone={giorniRicorso < 0 ? "neutral" : giorniRicorso <= 10 ? "danger" : "info"}>
                      {giorniRicorso < 0 ? "termine decorso" : `${giorniRicorso} giorni rimanenti`}
                    </StatusBadge>
                  )}
                </>
              ) : "—"}
            </dd>
            <dt className="text-ink-muted">Stato ricorso</dt><dd>{RICORSO_LABELS[fine.statoRicorso]}</dd>
            <dt className="text-ink-muted">Riaddebito driver</dt>
            <dd>{RIADDEBITO_LABELS[fine.riaddebito]}{fine.importoRiaddebito ? ` · ${fmtEur(Number(fine.importoRiaddebito))}` : ""}</dd>
          </dl>
          {fine.noteRicorso && <p className="text-xs bg-surface-sunken rounded-control p-2">{fine.noteRicorso}</p>}
        </section>

        <section className="card p-5 space-y-3 text-sm">
          <h2 className="font-semibold">Conducente</h2>
          {fine.driver ? (
            <div>
              <p className="font-semibold">{fine.driver.firstName} {fine.driver.lastName}</p>
              <p className="text-ink-muted text-xs">{fine.driver.email}</p>
              <p className="mt-2 text-xs">
                <span className="text-ink-muted">Fonte assegnazione:</span>{" "}
                <span className="bg-info-soft text-info rounded px-1.5 py-0.5">{fine.assegnazioneFonte ?? "non tracciata"}</span>
              </p>
            </div>
          ) : (
            <div>
              <StatusBadge tone="warn">da assegnare</StatusBadge>
              <p className="text-xs text-ink-muted mt-2">
                Nessun check-in/out o assegnazione giornaliera coerente con il momento dell&apos;infrazione:
                la multa resta &quot;da assegnare&quot; finché non viene attribuita manualmente con motivazione.
              </p>
            </div>
          )}

          {canManage && (
            <form action={assignFineDriverAction.bind(null, fine.id)} className="border-t border-line pt-3 space-y-2">
              <p className="text-xs font-semibold uppercase text-ink-muted">Assegnazione manuale (con motivazione, tracciata)</p>
              <select className="input" name="driverId" required defaultValue={fine.driverId ?? ""}>
                <option value="" disabled>— seleziona driver —</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.lastName} {d.firstName} ({d.email})</option>)}
              </select>
              <input className="input" name="motivo" required placeholder="Motivazione (es. turno da registro SIC cartaceo)" />
              <button className="btn-secondary">Assegna conducente</button>
            </form>
          )}
        </section>

        {canManage && (
          <>
            <section className="card p-5 space-y-4 text-sm">
              <h2 className="font-semibold">Gestione pratica</h2>
              {fine.stato === "DA_NOTIFICARE" && (
                <form action={notifyFineAction.bind(null, fine.id)} className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="label">Data notifica</label>
                    <input className="input" type="date" name="dataNotifica" defaultValue={new Date().toISOString().slice(0, 10)} required />
                  </div>
                  <button className="btn-primary">Registra notifica</button>
                  <p className="text-xs text-ink-muted w-full">La scadenza ricorso viene calcolata dal termine configurato (Prefetto).</p>
                </form>
              )}
              <form action={updateFineStatusAction.bind(null, fine.id)} className="space-y-2">
                <label className="label">Aggiorna stato</label>
                <select className="input" name="stato" defaultValue={fine.stato === "DA_NOTIFICARE" ? "NOTIFICATA" : fine.stato}>
                  <option value="NOTIFICATA">Notificata</option>
                  <option value="PAGATA">Pagata</option>
                  <option value="RICORSO">In ricorso</option>
                  <option value="ANNULLATA">Annullata</option>
                </select>
                <label className="label">Stato ricorso</label>
                <select className="input" name="statoRicorso" defaultValue={fine.statoRicorso}>
                  {Object.entries(RICORSO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input className="input" name="noteRicorso" placeholder="Note ricorso" defaultValue={fine.noteRicorso ?? ""} />
                <button className="btn-secondary">Salva stato</button>
              </form>
            </section>

            <section className="card p-5 space-y-3 text-sm">
              <h2 className="font-semibold">Riaddebito al driver</h2>
              <p className="text-xs text-ink-muted">Applicabile solo se previsto da contratto/policy. Ogni modifica lascia audit trail.</p>
              <form action={chargebackFineAction.bind(null, fine.id)} className="space-y-2">
                <select className="input" name="riaddebito" defaultValue={fine.riaddebito}>
                  {Object.entries(RIADDEBITO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input className="input" type="number" step="0.01" min={0} name="importoRiaddebito"
                  defaultValue={fine.importoRiaddebito ? String(fine.importoRiaddebito) : String(fine.importo)} />
                <button className="btn-secondary" disabled={!fine.driverId}>Aggiorna riaddebito</button>
                {!fine.driverId && <p className="text-xs text-warn">Prima assegna la multa a un conducente.</p>}
              </form>
            </section>
          </>
        )}
      </div>

      {canManage && auditRows.length > 0 && (
        <section className="card p-5 mt-6">
          <h2 className="font-semibold mb-3 text-sm">Audit trail pratica</h2>
          <ul className="text-xs space-y-1.5">
            {auditRows.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="text-ink-faint whitespace-nowrap">{fmtDateTime(a.createdAt)}</span>
                <span className="font-mono">{a.action}</span>
                <span className="text-ink-muted">{a.user ? `${a.user.firstName} ${a.user.lastName}` : "sistema"}</span>
                {a.meta ? <span className="text-ink-faint truncate">{JSON.stringify(a.meta)}</span> : null}
              </li>
            ))}
          </ul>
          <SourceNote>tabella AuditLog, entity=Fine, entityId={fine.id}</SourceNote>
        </section>
      )}
    </div>
  );
}
