import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigNumberArray } from "@/lib/config";
import { checkTagliando, checkRevisione, type Urgency } from "@/domain/maintenance";
import { PageHeader, StatusBadge, SourceNote, EmptyState } from "@/components/ui";
import { fmtDate, fmtKm } from "@/lib/format";

export const dynamic = "force-dynamic";

const TONE: Record<Urgency, "ok" | "warn" | "danger"> = { ok: "ok", warn: "warn", danger: "danger" };
const ORDER: Record<Urgency, number> = { danger: 0, warn: 1, ok: 2 };

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; station?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = stationScope(user);
  const view = params.view ?? "alerts";
  const stationFilter = scope.stationId ?? (user.role === "ADMIN" ? params.station || null : null);

  const [vehicles, sogliaGiorni, sogliaKm, filterStation] = await Promise.all([
    db.vehicle.findMany({
      where: { ...(stationFilter ? { stationId: stationFilter } : {}), stato: { not: "DISMESSO" } },
      include: { station: true },
      orderBy: { targa: "asc" },
    }),
    getConfigNumberArray("maint.alert.giorni"),
    getConfigNumberArray("maint.alert.km"),
    stationFilter && user.role === "ADMIN" ? db.station.findUnique({ where: { id: stationFilter } }) : Promise.resolve(null),
  ]);

  const oggi = new Date();
  const rows = vehicles
    .map((v) => {
      const tagliando = checkTagliando({
        oggi,
        kmAttuali: v.kmAttuali,
        prossimoTagliandoData: v.prossimoTagliandoData,
        prossimoTagliandoKm: v.prossimoTagliandoKm,
        sogliaGiorni,
        sogliaKm,
      });
      const revisione = checkRevisione({ oggi, prossimaRevisione: v.prossimaRevisione, sogliaGiorni });
      const worst = ORDER[tagliando.urgency] <= ORDER[revisione.urgency] ? tagliando.urgency : revisione.urgency;
      return { v, tagliando, revisione, worst };
    })
    .filter((r) => (view === "alerts" ? r.worst !== "ok" : true))
    .sort((a, b) => ORDER[a.worst] - ORDER[b.worst] || a.v.targa.localeCompare(b.v.targa));

  const counts = {
    danger: rows.filter((r) => r.worst === "danger").length,
    warn: rows.filter((r) => r.worst === "warn").length,
  };

  return (
    <div>
      <PageHeader
        title="Scadenzario tagliandi e revisioni"
        subtitle={`Soglie alert: ${sogliaGiorni.join("/")} giorni · ${sogliaKm.join("/")} km (configurabili da Admin)`}
        action={can(user, "maintenance.manage") ? <Link href="/maintenance/new" className="btn-primary">+ Registra intervento</Link> : undefined}
      />

      {filterStation && (
        <p className="mb-4 text-sm text-info bg-info-soft rounded-control px-3 py-2 flex items-center justify-between">
          <span>Filtro attivo: solo stazione <strong>{filterStation.code} — {filterStation.name}</strong></span>
          <a href="/maintenance" className="underline">rimuovi filtro</a>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-control border border-line overflow-hidden text-sm font-semibold">
          <Link href={`?view=alerts${stationFilter ? `&station=${stationFilter}` : ""}`} className={`px-4 py-2 ${view === "alerts" ? "bg-brand text-ink-inverse" : "bg-surface-raised"}`}>
            Solo alert
          </Link>
          <Link href={`?view=all${stationFilter ? `&station=${stationFilter}` : ""}`} className={`px-4 py-2 ${view === "all" ? "bg-brand text-ink-inverse" : "bg-surface-raised"}`}>
            Tutti i veicoli
          </Link>
        </div>
        {view === "alerts" && (
          <p className="text-sm text-ink-muted">
            <span className="text-danger font-semibold">{counts.danger} critici</span> · <span className="text-warn font-semibold">{counts.warn} in avvicinamento</span>
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState message={view === "alerts" ? "Nessun veicolo in alert: scadenzario sotto controllo. ✅" : "Nessun veicolo."} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Targa</th><th>Stazione</th><th>Km attuali</th>
                <th>Tagliando</th><th>Scadenza tagliando</th>
                <th>Revisione</th><th>Scadenza revisione</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ v, tagliando, revisione }) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/vehicles/${v.id}`} className="font-mono font-semibold text-brand hover:underline">{v.targa}</Link>
                    <div className="text-xs text-ink-muted">{v.modello}</div>
                  </td>
                  <td>{v.station.code}</td>
                  <td className="whitespace-nowrap">{fmtKm(v.kmAttuali)}</td>
                  <td><StatusBadge tone={TONE[tagliando.urgency]}>{tagliando.reason}</StatusBadge></td>
                  <td className="text-xs whitespace-nowrap">
                    {fmtDate(v.prossimoTagliandoData)}{v.prossimoTagliandoKm ? ` · ${fmtKm(v.prossimoTagliandoKm)}` : ""}
                  </td>
                  <td><StatusBadge tone={TONE[revisione.urgency]}>{revisione.reason}</StatusBadge></td>
                  <td className="text-xs whitespace-nowrap">{fmtDate(v.prossimaRevisione)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <SourceNote>
              tabella Vehicle{stationFilter ? ` (stazione ${filterStation?.code ?? ""})` : " (cluster)"}, soglie da AppConfig (maint.alert.giorni / maint.alert.km), calcolo al {oggi.toLocaleDateString("it-IT")}
            </SourceNote>
          </div>
        </div>
      )}
    </div>
  );
}
