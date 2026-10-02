import { requireUser } from "@/lib/auth";
import { can, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge, SourceNote } from "@/components/ui";
import { fmtDate, fmtEur, fmtKm } from "@/lib/format";
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
    },
  });
  if (!vehicle) notFound();
  if (scope.stationId && vehicle.stationId !== scope.stationId && user.role !== "DRIVER") notFound();

  const isAdmin = user.role === "ADMIN";
  const canManage = can(user, "vehicle.manage") && (!scope.stationId || vehicle.stationId === scope.stationId);
  const stations = canManage ? await db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }) : [];

  return (
    <div>
      <PageHeader
        title={`${vehicle.targa} — ${vehicle.modello}`}
        subtitle={`${vehicle.station.code} · ${FUEL_LABELS[vehicle.alimentazione]}${vehicle.immatricolazione ? ` · immatricolato ${fmtDate(vehicle.immatricolazione)}` : ""}`}
        action={<StatusBadge tone={vehicle.stato === "ATTIVO" ? "ok" : vehicle.stato === "DISMESSO" ? "neutral" : "warn"}>{STATUS_LABELS[vehicle.stato]}</StatusBadge>}
        backHref="/vehicles"
        backLabel="Flotta"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Km attuali</div>
          <div className="text-2xl font-bold">{fmtKm(vehicle.kmAttuali)}</div>
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
