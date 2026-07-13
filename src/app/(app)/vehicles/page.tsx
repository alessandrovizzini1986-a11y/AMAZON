import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { STATUS_LABELS, FUEL_LABELS } from "./VehicleForm";
import { VehicleTable, type VehicleRow } from "./VehicleTable";
import type { VehicleStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

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

  const rows: VehicleRow[] = vehicles.map((v) => ({
    id: v.id,
    targa: v.targa,
    modello: v.modello,
    allestimento: v.allestimento,
    alimentazioneLabel: FUEL_LABELS[v.alimentazione],
    hvoNote: v.hvoCompatibile && v.alimentazione !== "DIESEL_HVO",
    stationCode: v.station.code,
    stato: v.stato,
    kmAttuali: v.kmAttuali,
    canoneMese: v.canoneMese ? Number(v.canoneMese) : null,
    leasingCompany: v.leasingCompany,
  }));

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

      <VehicleTable vehicles={rows} statusLabels={STATUS_LABELS} isAdmin={isAdmin} />
    </div>
  );
}
