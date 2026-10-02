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
    stationName: v.station.name,
    stato: v.stato,
    kmAttuali: v.kmAttuali,
    canoneMese: v.canoneMese ? Number(v.canoneMese) : null,
    leasingCompany: v.leasingCompany,
  }));

  // chip stazione: link GET che preservano il filtro stato
  const stationHref = (stationId?: string) => {
    const q = new URLSearchParams();
    if (stationId) q.set("station", stationId);
    if (params.stato) q.set("stato", params.stato);
    const qs = q.toString();
    return qs ? `/vehicles?${qs}` : "/vehicles";
  };
  const chip = (active: boolean) =>
    `inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors ${
      active ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised text-ink hover:border-brand hover:text-brand"
    }`;

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      {isAdmin && (
        <>
          <Link href={stationHref()} className={chip(!params.station)}>Tutte</Link>
          {stations.map((s) => (
            <Link key={s.id} href={stationHref(s.id)} className={chip(params.station === s.id)} title={s.name}>
              {s.code}
            </Link>
          ))}
        </>
      )}
      <form method="get" className="ml-auto">
        {params.station && <input type="hidden" name="station" value={params.station} />}
        <select
          className="input h-10 w-auto"
          name="stato"
          defaultValue={params.stato ?? ""}
          aria-label="Filtra per stato"
        >
          <option value="">Non dismessi</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn-secondary ml-2 h-10">Applica</button>
      </form>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Flotta"
        title={scope.stationId ? "Le targhe della tua stazione" : "Dove si trova ogni targa"}
        action={can(user, "vehicle.manage") ? <Link href="/vehicles/new" className="btn-primary">+ Nuovo veicolo</Link> : undefined}
      />

      {params.error && (
        <p className="mb-4 text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{params.error}</p>
      )}

      <VehicleTable vehicles={rows} statusLabels={STATUS_LABELS} isAdmin={isAdmin} filters={filters} />
    </div>
  );
}
