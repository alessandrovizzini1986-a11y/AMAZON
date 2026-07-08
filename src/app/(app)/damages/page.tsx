import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, SourceNote, EmptyState } from "@/components/ui";
import { fmtDate, fmtEur } from "@/lib/format";
import { updateDamageAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DamagesPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const scope = stationScope(user);
  const canManage = can(user, "vehicle.manage");
  const stationFilter = scope.stationId ?? (user.role === "ADMIN" ? params.station || null : null);

  const [damages, filterStation] = await Promise.all([
    db.damage.findMany({
      where: {
        ...(user.role === "DRIVER"
          ? { reporterId: user.id }
          : stationFilter
            ? { vehicle: { stationId: stationFilter } }
            : {}),
      },
      include: { vehicle: { include: { station: true } }, reporter: true },
      orderBy: { data: "desc" },
      take: 100,
    }),
    stationFilter && user.role === "ADMIN" ? db.station.findUnique({ where: { id: stationFilter } }) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title="Danni e sinistri"
        subtitle={user.role === "DRIVER" ? "Le tue segnalazioni" : "Segnalazioni, responsabilità e pratiche assicurative"}
        action={<Link href="/damages/new" className="btn-primary">+ Segnala danno</Link>}
      />

      {filterStation && (
        <p className="mb-4 text-sm text-info bg-info-soft rounded-control px-3 py-2 flex items-center justify-between">
          <span>Filtro attivo: solo stazione <strong>{filterStation.code} — {filterStation.name}</strong></span>
          <a href="/damages" className="underline">rimuovi filtro</a>
        </p>
      )}

      {damages.length === 0 ? (
        <EmptyState message="Nessun danno registrato." />
      ) : (
        <div className="space-y-3">
          {damages.map((d) => (
            <details key={d.id} className="card p-4">
              <summary className="flex flex-wrap items-center gap-3 cursor-pointer list-none">
                <span className="font-mono font-semibold">{d.vehicle.targa}</span>
                <span className="text-sm">{d.tipo}</span>
                <span className="text-xs text-ink-muted">{fmtDate(d.data)} · {d.vehicle.station.code}</span>
                <span className="text-xs text-ink-muted">segnalato da {d.reporter ? `${d.reporter.firstName} ${d.reporter.lastName}` : "—"}</span>
                <span className="ml-auto flex gap-2">
                  <StatusBadge tone={d.responsabilita === "DRIVER" ? "warn" : d.responsabilita === "TERZI" ? "info" : "neutral"}>
                    {d.responsabilita}
                  </StatusBadge>
                  <StatusBadge tone={d.chiuso ? "ok" : "warn"}>{d.chiuso ? "chiuso" : "aperto"}</StatusBadge>
                </span>
              </summary>
              <div className="mt-4 border-t border-line pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  {d.descrizione && <p>{d.descrizione}</p>}
                  {d.fotoUrl && (
                    <a href={`/api/uploads/${d.fotoUrl}`} target="_blank" className="text-brand underline text-xs">apri foto</a>
                  )}
                  <dl className="grid grid-cols-2 gap-y-1 text-xs">
                    <dt className="text-ink-muted">Centro riparazione</dt><dd>{d.centroRiparazione ?? "—"}</dd>
                    <dt className="text-ink-muted">Pratica assicurativa</dt><dd>{d.praticaAssicurativa ?? "—"}</dd>
                    <dt className="text-ink-muted">Costo stimato</dt><dd>{d.costoStimato ? fmtEur(Number(d.costoStimato)) : "—"}</dd>
                  </dl>
                </div>
                {canManage && (
                  <form action={updateDamageAction.bind(null, d.id)} className="space-y-2">
                    <select className="input" name="responsabilita" defaultValue={d.responsabilita}>
                      <option value="IGNOTO">Responsabilità: ignoto</option>
                      <option value="DRIVER">Responsabilità: driver</option>
                      <option value="TERZI">Responsabilità: terzi</option>
                    </select>
                    <input className="input" name="centroRiparazione" placeholder="Centro riparazione" defaultValue={d.centroRiparazione ?? ""} />
                    <input className="input" name="praticaAssicurativa" placeholder="Rif. pratica assicurativa" defaultValue={d.praticaAssicurativa ?? ""} />
                    <input className="input" type="number" step="0.01" name="costoStimato" placeholder="Costo stimato €" defaultValue={d.costoStimato ? String(d.costoStimato) : ""} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="chiuso" defaultChecked={d.chiuso} /> Danno chiuso
                    </label>
                    <button className="btn-secondary">Salva</button>
                  </form>
                )}
              </div>
            </details>
          ))}
          <SourceNote>tabella Damage — ultime 100 righe{user.role === "DRIVER" ? ", solo tue segnalazioni" : scope.stationId ? ", propria stazione" : ""}</SourceNote>
        </div>
      )}
    </div>
  );
}
