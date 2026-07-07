import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, EmptyState, SourceNote } from "@/components/ui";
import { fmtEur, fmtKm } from "@/lib/format";
import { STATUS_LABELS, FUEL_LABELS } from "./VehicleForm";
import type { VehicleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral" | "info"> = {
  ATTIVO: "ok",
  IN_OFFICINA: "warn",
  SOSTITUTIVO: "info",
  DISMESSO: "neutral",
};

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string; stato?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = stationScope(user);

  const where = {
    ...(scope.stationId ? { stationId: scope.stationId } : params.station ? { stationId: params.station } : {}),
    ...(params.stato ? { stato: params.stato as VehicleStatus } : { stato: { not: "DISMESSO" as VehicleStatus } }),
  };

  const [vehicles, stations] = await Promise.all([
    db.vehicle.findMany({ where, include: { station: true }, orderBy: { targa: "asc" } }),
    db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);

  const isAdmin = user.role === "ADMIN";

  return (
    <div>
      <PageHeader
        title="Flotta"
        subtitle={scope.stationId ? "Veicoli della tua stazione" : "Tutte le stazioni del cluster"}
        action={can(user, "vehicle.manage") ? <Link href="/vehicles/new" className="btn-primary">+ Nuovo veicolo</Link> : undefined}
      />

      {params.error && (
        <p className="mb-4 text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{params.error}</p>
      )}

      {/* filtri */}
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        {isAdmin && (
          <select className="input max-w-56" name="station" defaultValue={params.station ?? ""}>
            <option value="">Tutte le stazioni</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
        )}
        <select className="input max-w-48" name="stato" defaultValue={params.stato ?? ""}>
          <option value="">Non dismessi</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn-secondary">Filtra</button>
      </form>

      {vehicles.length === 0 ? (
        <EmptyState message="Nessun veicolo trovato con questi filtri. Usa Import dati per il caricamento iniziale." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Targa</th><th>Modello</th><th>Alimentazione</th><th>Stazione</th>
                <th>Stato</th><th>Km</th><th>Canone/g</th><th>Leasing</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/vehicles/${v.id}`} className="font-mono font-semibold text-brand hover:underline">
                      {v.targa}
                    </Link>
                  </td>
                  <td>{v.modello}{v.allestimento ? ` · ${v.allestimento}` : ""}</td>
                  <td>{FUEL_LABELS[v.alimentazione]}{v.hvoCompatibile && v.alimentazione !== "DIESEL_HVO" ? " (HVO ok)" : ""}</td>
                  <td>{v.station.code}</td>
                  <td><StatusBadge tone={STATUS_TONE[v.stato]}>{STATUS_LABELS[v.stato]}</StatusBadge></td>
                  <td className="whitespace-nowrap">{fmtKm(v.kmAttuali)}</td>
                  <td className="whitespace-nowrap">{isAdmin ? fmtEur(Number(v.canoneGiorno)) : "—"}</td>
                  <td>{v.leasingCompany ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <SourceNote>
              tabella Vehicle{scope.stationId ? ", filtro stazione utente" : params.station ? ", filtro stazione selezionata" : ", tutte le stazioni"} — {vehicles.length} veicoli al {new Date().toLocaleDateString("it-IT")}
            </SourceNote>
          </div>
        </div>
      )}
    </div>
  );
}
