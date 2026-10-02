import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigStringArray } from "@/lib/config";
import { PageHeader, SourceNote } from "@/components/ui";
import { fmtEurInt, fmtNum } from "@/lib/format";
import { StationFilter } from "./StationFilter";
import { ExportExcelButton } from "./ExportExcelButton";

export const dynamic = "force-dynamic";

// colori fissi dei due appalti, usati in barre e legenda
const COLOR_AMAZON = "#1f5fa8";
const COLOR_ALTRI = "#c2650a";

type StationRow = { stationId: string; code: string; name: string; veicoli: number; canone: number; amazon: boolean };

function Kpi({ label, value, note, href }: { label: string; value: string; note: string; href: string }) {
  return (
    <Link href={href} className="card block p-4 transition-colors hover:border-brand md:p-[22px]">
      <div className="text-[13px] font-medium text-ink-muted md:text-sm">{label}</div>
      <div className="mt-1.5 text-[24px] font-bold leading-tight tracking-[-0.02em] tabular-nums md:mt-2 md:text-[38px]">{value}</div>
      <div className="mt-1 text-[13px] text-ink-muted">{note}</div>
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
      {label}
    </div>
  );
}

/**
 * Dashboard: solo numero di furgoni e canone mensile, per stazione.
 * Amazon e gli altri appalti (es. GLS) sono sempre distinti, mai sommati
 * come se fossero un unico cliente.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const user = await requireUser();
  assertCan(user, "dashboard.station");
  const params = await searchParams;

  const isAdmin = user.role === "ADMIN";
  // resp. mezzi: vista bloccata sulla propria stazione; admin: cluster o singola stazione
  const stationFilter = isAdmin ? params.station ?? null : user.stationId;

  const [stations, vehicles, stazioniNonAmazon] = await Promise.all([
    db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    // un sostitutivo copre temporaneamente un veicolo guasto già conteggiato:
    // non è capacità aggiuntiva, quindi resta fuori dal conteggio della flotta
    db.vehicle.findMany({
      where: { stato: { notIn: ["DISMESSO", "SOSTITUTIVO"] }, ...(stationFilter ? { stationId: stationFilter } : {}) },
      select: { stationId: true, canoneMese: true },
    }),
    getConfigStringArray("appalto.nonAmazon.stationCodes"),
  ]);

  const stationList = stationFilter ? stations.filter((s) => s.id === stationFilter) : stations;
  const byStation = new Map<string, StationRow>(
    stationList.map((s) => [
      s.id,
      { stationId: s.id, code: s.code, name: s.name, veicoli: 0, canone: 0, amazon: !stazioniNonAmazon.includes(s.code) },
    ]),
  );
  for (const v of vehicles) {
    const row = byStation.get(v.stationId);
    if (row) { row.veicoli += 1; row.canone += Number(v.canoneMese ?? 0); }
  }
  // Amazon prima, poi gli altri appalti
  const rows = [...byStation.values()].sort((a, b) => Number(b.amazon) - Number(a.amazon) || a.code.localeCompare(b.code));
  const amazonRows = rows.filter((r) => r.amazon);
  const altriRows = rows.filter((r) => !r.amazon);
  const sum = (rs: StationRow[], k: "veicoli" | "canone") => rs.reduce((s, r) => s + r[k], 0);
  const totVeicoli = sum(rows, "veicoli");
  const totCanone = sum(rows, "canone");
  const maxCanone = Math.max(1, ...rows.map((r) => r.canone));
  const altriLabel = altriRows.length === 1 ? altriRows[0].code : "altri appalti";
  const stazioni = (n: number) => `${n} ${n === 1 ? "stazione" : "stazioni"}`;

  const scope = stationList.length === 1 && stationFilter ? stationList[0] : null;
  const kpiCount = scope ? 3 : altriRows.length > 0 ? 4 : 3;
  const fleetHref = (stationId?: string | null) => (stationId ? `/vehicles?station=${stationId}` : "/vehicles");

  return (
    <div>
      <PageHeader
        eyebrow={scope ? `Stazione ${scope.code} · ${scope.name}` : "Situazione flotta"}
        title={scope ? "Veicoli e canone della stazione" : "Veicoli e costi per stazione"}
        action={
          isAdmin ? (
            <div className="flex flex-wrap items-end gap-2.5">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
                Stazione
                <StationFilter stations={stations} value={stationFilter ?? ""} />
              </label>
              <ExportExcelButton stationId={stationFilter} />
            </div>
          ) : undefined
        }
      />

      {/* KPI */}
      <div className={`mb-6 grid grid-cols-2 gap-3 md:gap-4 ${kpiCount === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Kpi label="Veicoli in flotta" value={fmtNum(totVeicoli)} note="esclusi sostitutivi e dismessi" href={fleetHref(stationFilter)} />
        <Kpi label="Canone mensile totale" value={fmtEurInt(totCanone)} note="impegno fisso al mese" href={fleetHref(stationFilter)} />
        {scope ? (
          <Kpi
            label="Canone medio per veicolo"
            value={totVeicoli ? fmtEurInt(totCanone / totVeicoli) : "—"}
            note="al mese"
            href={fleetHref(stationFilter)}
          />
        ) : (
          <>
            <Kpi
              label="Appalto Amazon"
              value={fmtNum(sum(amazonRows, "veicoli"))}
              note={`${stazioni(amazonRows.length)} · ${fmtEurInt(sum(amazonRows, "canone"))}/mese`}
              href="/vehicles"
            />
            {altriRows.length > 0 && (
              <Kpi
                label={`Appalto ${altriLabel}`}
                value={fmtNum(sum(altriRows, "veicoli"))}
                note={`${stazioni(altriRows.length)} · ${fmtEurInt(sum(altriRows, "canone"))}/mese`}
                href={altriRows.length === 1 ? fleetHref(altriRows[0].stationId) : "/vehicles"}
              />
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-start">
        {/* grafico: canone mensile per stazione */}
        <section className="card p-5 md:p-[26px] lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[19px] font-semibold">Canone mensile per stazione</h2>
            {altriRows.length > 0 && amazonRows.length > 0 && (
              <div className="flex gap-4 text-[13px] text-[#3c4a5c]">
                <Legend color={COLOR_AMAZON} label="Amazon" />
                <Legend color={COLOR_ALTRI} label={altriLabel === "altri appalti" ? "Altri appalti" : altriLabel} />
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {rows.map((r) => (
              <Link
                key={r.stationId}
                href={fleetHref(r.stationId)}
                className="group grid grid-cols-[56px_1fr_92px] items-center gap-3 md:grid-cols-[64px_1fr_104px] md:gap-3.5"
                title={`${r.code} — ${r.name}: ${r.veicoli} veicoli, ${fmtEurInt(r.canone)}/mese`}
              >
                <span className="font-mono text-sm font-semibold group-hover:text-brand">{r.code}</span>
                <span className="h-[22px] rounded bg-surface-sunken">
                  <span
                    className="block h-[22px] rounded transition-opacity group-hover:opacity-85"
                    style={{ width: `${(r.canone / maxCanone) * 100}%`, background: r.amazon ? COLOR_AMAZON : COLOR_ALTRI }}
                  />
                </span>
                <span className="text-right text-sm font-semibold tabular-nums">{fmtEurInt(r.canone)}</span>
              </Link>
            ))}
          </div>
          <SourceNote>canone mensile dei veicoli in flotta (non dismessi, non sostitutivi), per stazione · clic su una barra per vedere le targhe</SourceNote>
        </section>

        {/* tabella: veicoli per stazione */}
        <section className="card p-5 md:p-[26px] lg:col-span-2">
          <h2 className="text-[19px] font-semibold">Veicoli per stazione</h2>
          <table className="mt-4 w-full border-collapse text-[15px]">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                <th className="border-b border-line py-2.5 text-left">Stazione</th>
                <th className="border-b border-line py-2.5 text-right">Veicoli</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.stationId}>
                  <td className={`border-b border-[#eef1f4] py-2.5 ${!r.amazon && i > 0 && rows[i - 1].amazon ? "border-t border-t-line" : ""}`}>
                    <Link href={fleetHref(r.stationId)} className="font-mono font-semibold text-brand hover:underline">{r.code}</Link>{" "}
                    <span className="text-ink-muted">{r.name}</span>
                  </td>
                  <td className="border-b border-[#eef1f4] py-2.5 text-right font-semibold tabular-nums">{fmtNum(r.veicoli)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 font-bold">Totale</td>
                <td className="py-3 text-right font-bold tabular-nums">{fmtNum(totVeicoli)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
