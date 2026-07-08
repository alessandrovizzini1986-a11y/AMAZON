import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, SourceNote } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtEur, fmtKm } from "@/lib/format";
import { checkTagliando, checkRevisione } from "@/domain/maintenance";
import { getConfigNumberArray } from "@/lib/config";
import { VehicleForm, STATUS_LABELS, FUEL_LABELS } from "../VehicleForm";
import { updateVehicleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const scope = stationScope(user);

  const vehicle = await db.vehicle.findUnique({
    where: { id },
    include: {
      station: true,
      stationHistory: { include: { station: true }, orderBy: { fromDate: "desc" } },
      serviceRecords: { orderBy: { data: "desc" }, take: 30 },
      fines: { orderBy: { dataOraInfrazione: "desc" }, take: 20, include: { driver: true } },
      replacementCases: { orderBy: { dataIngressoOfficina: "desc" }, take: 10 },
      damages: { orderBy: { data: "desc" }, take: 10 },
      assignments: { orderBy: { date: "desc" }, take: 15, include: { driver: true, station: true } },
    },
  });
  if (!vehicle) notFound();
  if (scope.stationId && vehicle.stationId !== scope.stationId && user.role !== "DRIVER") notFound();

  const [sogliaGiorni, sogliaKm] = await Promise.all([
    getConfigNumberArray("maint.alert.giorni"),
    getConfigNumberArray("maint.alert.km"),
  ]);
  const oggi = new Date();
  const tagliando = checkTagliando({
    oggi,
    kmAttuali: vehicle.kmAttuali,
    prossimoTagliandoData: vehicle.prossimoTagliandoData,
    prossimoTagliandoKm: vehicle.prossimoTagliandoKm,
    sogliaGiorni,
    sogliaKm,
  });
  const revisione = checkRevisione({ oggi, prossimaRevisione: vehicle.prossimaRevisione, sogliaGiorni });

  const isAdmin = user.role === "ADMIN";
  const canManage = can(user, "vehicle.manage") && (!scope.stationId || vehicle.stationId === scope.stationId);
  const stations = canManage ? await db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }) : [];

  return (
    <div>
      <PageHeader
        title={`${vehicle.targa} — ${vehicle.modello}`}
        subtitle={`${vehicle.station.code} · ${FUEL_LABELS[vehicle.alimentazione]}${vehicle.immatricolazione ? ` · immatricolato ${fmtDate(vehicle.immatricolazione)}` : ""}`}
        action={<StatusBadge tone={vehicle.stato === "ATTIVO" ? "ok" : vehicle.stato === "DISMESSO" ? "neutral" : "warn"}>{STATUS_LABELS[vehicle.stato]}</StatusBadge>}
      />

      {/* stato sintetico manutenzione */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Km attuali</div>
          <div className="text-2xl font-bold">{fmtKm(vehicle.kmAttuali)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Tagliando</div>
          <StatusBadge tone={tagliando.urgency === "ok" ? "ok" : tagliando.urgency === "warn" ? "warn" : "danger"}>
            {tagliando.reason}
          </StatusBadge>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Revisione</div>
          <StatusBadge tone={revisione.urgency === "ok" ? "ok" : revisione.urgency === "warn" ? "warn" : "danger"}>
            {revisione.reason}
          </StatusBadge>
        </div>
        {isAdmin && (
          <div className="card p-4">
            <div className="text-xs font-semibold text-ink-muted uppercase">Canone noleggio</div>
            <div className="text-2xl font-bold">
              {vehicle.canoneMese ? fmtEur(Number(vehicle.canoneMese)) : "—"}
              <span className="text-sm font-normal text-ink-muted">/mese</span>
            </div>
            <div className="text-xs text-ink-muted">
              {vehicle.leasingCompany ?? "—"}{vehicle.contrattoLeasingNo ? ` · ${vehicle.contrattoLeasingNo}` : ""}
              {vehicle.tipoContratto ? ` · ${vehicle.tipoContratto}` : ""}
            </div>
            {vehicle.franchigiaDanni && (
              <div className="text-xs text-ink-muted">Franchigia danni: {fmtEur(Number(vehicle.franchigiaDanni))}</div>
            )}
          </div>
        )}
      </div>

      {(vehicle.contrattoDataInizio || vehicle.contrattoDataFine || vehicle.note) && (
        <div className="card p-4 mb-6 text-sm">
          {(vehicle.contrattoDataInizio || vehicle.contrattoDataFine) && (
            <p className="text-ink-muted">
              Contratto: {vehicle.contrattoDataInizio ? fmtDate(vehicle.contrattoDataInizio) : "—"}
              {" → "}
              {vehicle.contrattoDataFine ? fmtDate(vehicle.contrattoDataFine) : "in corso"}
            </p>
          )}
          {vehicle.note && <p className="mt-1">{vehicle.note}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* storico interventi */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Storico interventi</h2>
          {vehicle.serviceRecords.length === 0 ? (
            <p className="text-sm text-ink-muted">Nessun intervento registrato.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Data</th><th>Tipo</th><th>Officina</th><th>Km</th><th>Costo</th></tr></thead>
                <tbody>
                  {vehicle.serviceRecords.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.data)}</td>
                      <td>{r.tipo}</td>
                      <td>{r.officina}</td>
                      <td>{fmtKm(r.kmIntervento)}</td>
                      <td>{fmtEur(Number(r.costo))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <SourceNote>tabella ServiceRecord, veicolo {vehicle.targa} — ultimi 30 interventi</SourceNote>
            </div>
          )}
        </section>

        {/* storico stazioni */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Storico assegnazioni stazione</h2>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Stazione</th><th>Dal</th><th>Al</th><th>Nota</th></tr></thead>
              <tbody>
                {vehicle.stationHistory.map((h) => (
                  <tr key={h.id}>
                    <td>{h.station.code} — {h.station.name}</td>
                    <td>{fmtDate(h.fromDate)}</td>
                    <td>{h.toDate ? fmtDate(h.toDate) : <StatusBadge tone="ok">attuale</StatusBadge>}</td>
                    <td>{h.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SourceNote>tabella VehicleStationHistory, veicolo {vehicle.targa}</SourceNote>
          </div>
        </section>

        {/* multe */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Multe</h2>
          {vehicle.fines.length === 0 ? (
            <p className="text-sm text-ink-muted">Nessuna multa registrata.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Data/ora</th><th>Violazione</th><th>Importo</th><th>Conducente</th><th>Stato</th></tr></thead>
                <tbody>
                  {vehicle.fines.map((f) => (
                    <tr key={f.id}>
                      <td><Link href={`/fines/${f.id}`} className="text-brand hover:underline whitespace-nowrap">{fmtDateTime(f.dataOraInfrazione)}</Link></td>
                      <td>{f.tipoViolazione}</td>
                      <td>{fmtEur(Number(f.importo))}</td>
                      <td>{f.driver ? `${f.driver.firstName} ${f.driver.lastName}` : <StatusBadge tone="warn">da assegnare</StatusBadge>}</td>
                      <td><StatusBadge tone={f.stato === "PAGATA" ? "ok" : f.stato === "RICORSO" ? "info" : "warn"}>{f.stato}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* pratiche sostitutivo + danni */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Pratiche sostitutivo</h2>
          {vehicle.replacementCases.length === 0 ? (
            <p className="text-sm text-ink-muted">Nessuna pratica.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {vehicle.replacementCases.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <Link href={`/replacements/${c.id}`} className="text-brand hover:underline">
                    {c.motivo} — ingresso {fmtDate(c.dataIngressoOfficina)}
                  </Link>
                  <StatusBadge tone={c.stato === "CONFERMATA" ? "ok" : c.stato === "CONTESTATA" ? "danger" : "info"}>{c.stato}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
          <h2 className="font-semibold mb-3 mt-6">Danni</h2>
          {vehicle.damages.length === 0 ? (
            <p className="text-sm text-ink-muted">Nessun danno registrato.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {vehicle.damages.map((dm) => (
                <li key={dm.id} className="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <span>{fmtDate(dm.data)} — {dm.tipo} ({dm.responsabilita})</span>
                  <StatusBadge tone={dm.chiuso ? "ok" : "warn"}>{dm.chiuso ? "chiuso" : "aperto"}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ultime movimentazioni */}
      <section className="card p-5 mt-6">
        <h2 className="font-semibold mb-3">Ultime movimentazioni</h2>
        {vehicle.assignments.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessuna movimentazione registrata.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Data</th><th>Driver</th><th>Stazione</th><th>Check-in</th><th>Check-out</th><th>Danni</th></tr></thead>
              <tbody>
                {vehicle.assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.date)}</td>
                    <td>{a.driver.firstName} {a.driver.lastName}</td>
                    <td>{a.station.code}</td>
                    <td>{a.checkInAt ? `${fmtDateTime(a.checkInAt)} · ${fmtKm(a.checkInKm)}` : "—"}</td>
                    <td>{a.checkOutAt ? `${fmtDateTime(a.checkOutAt)} · ${fmtKm(a.checkOutKm)}` : "—"}</td>
                    <td>{a.danniRilevati ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SourceNote>tabella Assignment, veicolo {vehicle.targa} — ultime 15 righe</SourceNote>
          </div>
        )}
      </section>

      {canManage && (
        <details className="mt-6">
          <summary className="cursor-pointer font-semibold text-sm text-brand">Modifica dati veicolo</summary>
          <div className="mt-3">
            <VehicleForm action={updateVehicleAction.bind(null, vehicle.id)} stations={stations} vehicle={vehicle} />
          </div>
        </details>
      )}
    </div>
  );
}
