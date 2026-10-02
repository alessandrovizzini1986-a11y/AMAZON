import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigStringArray } from "@/lib/config";
import { PageHeader, KpiCard, SourceNote } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { CostByStationChart, type CostRow } from "./charts";
import { StationFilter } from "./StationFilter";
import { ExportExcelButton } from "./ExportExcelButton";

export const dynamic = "force-dynamic";

function CostTableRow({ r }: { r: CostRow }) {
  const rigaAZero = r.danni === 0 && r.carburante === 0 && r.pedaggi === 0 && r.multe === 0;
  return (
    <tr className={rigaAZero ? "opacity-50" : ""}>
      <td className="font-semibold">{r.station}</td>
      <td>{fmtEur(r.danni)}</td>
      <td>{fmtEur(r.carburante)}</td>
      <td>{fmtEur(r.pedaggi)}</td>
      <td>{fmtEur(r.multe)}</td>
      <td className="font-semibold">{fmtEur(r.danni + r.carburante + r.pedaggi + r.multe)}</td>
      <td className="text-xs whitespace-nowrap">
        <Link className="text-brand underline" href={`/vehicles?station=${r.stationId}`}>flotta</Link>
      </td>
    </tr>
  );
}

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

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const oggi = new Date();

  const [stations, vehicles, stazioniNonAmazon] = await Promise.all([
    db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.vehicle.findMany({
      where: { stato: { not: "DISMESSO" }, ...(stationFilter ? { stationId: stationFilter } : {}) },
      include: { station: true },
    }),
    getConfigStringArray("appalto.nonAmazon.stationCodes"),
  ]);
  // due appalti distinti (Amazon + eventuali altri, es. GLS): i costi/canoni non
  // vanno mai sommati come se fosse un unico cliente — sempre riportati distinti
  const isAmazon = (code: string) => !stazioniNonAmazon.includes(code);

  const vehicleIds = vehicles.map((v) => v.id);
  const vehicleStation = new Map(vehicles.map((v) => [v.id, v.station.code]));

  const [fines, fuelTx, tolls, damages] = await Promise.all([
    db.fine.findMany({
      where: { dataOraInfrazione: { gte: since }, vehicleId: { in: vehicleIds } },
      select: { vehicleId: true, importo: true, dataOraInfrazione: true },
    }),
    db.fuelTransaction.findMany({
      where: { data: { gte: since }, fuelCard: { vehicleId: { in: vehicleIds } } },
      select: { importo: true, fuelCard: { select: { vehicleId: true } } },
    }),
    db.tollTransaction.findMany({
      where: { data: { gte: since }, ...(stationFilter ? { stationId: stationFilter } : {}) },
      select: { stationId: true, importo: true },
    }),
    db.damage.findMany({
      where: { data: { gte: since }, vehicleId: { in: vehicleIds }, costoStimato: { not: null } },
      select: { vehicleId: true, costoStimato: true },
    }),
  ]);

  // un sostitutivo copre temporaneamente un veicolo guasto già conteggiato:
  // non è capacità aggiuntiva, quindi va escluso dal conteggio della flotta
  // (altrimenti un guasto+il suo sostitutivo verrebbero contati come 2 mezzi
  // invece di 1)
  const veicoliFlotta = vehicles.filter((v) => v.stato !== "SOSTITUTIVO");

  // ---- veicoli e costi per stazione (mai compensati tra loro) ----
  // manutenzione non è una voce a parte: è sempre inclusa nel canone di
  // noleggio (rete convenzionata) e mostrarla come costo aggiuntivo è
  // fuorviante. Il canone è un impegno mensile fisso (non una spesa
  // "ultimi 30gg" come le altre voci) ma è la voce di costo più importante
  // quindi resta la prima colonna.
  const byStation = new Map<string, CostRow>();
  const stationList = stationFilter ? stations.filter((s) => s.id === stationFilter) : stations;
  for (const s of stationList) {
    byStation.set(s.code, { station: s.code, stationId: s.id, veicoli: 0, canone: 0, danni: 0, carburante: 0, pedaggi: 0, multe: 0 });
  }
  const add = (code: string | undefined, key: "danni" | "carburante" | "pedaggi" | "multe", v: number) => {
    if (!code) return;
    const row = byStation.get(code);
    if (row) row[key] += v;
  };
  for (const v of veicoliFlotta) {
    const row = byStation.get(v.station.code);
    if (row) { row.veicoli += 1; row.canone += Number(v.canoneMese ?? 0); }
  }
  for (const d of damages) add(vehicleStation.get(d.vehicleId), "danni", Number(d.costoStimato ?? 0));
  for (const t of fuelTx) add(t.fuelCard.vehicleId ? vehicleStation.get(t.fuelCard.vehicleId) : undefined, "carburante", Number(t.importo));
  for (const t of tolls) add(stations.find((s) => s.id === t.stationId)?.code, "pedaggi", Number(t.importo));
  for (const f of fines) add(vehicleStation.get(f.vehicleId), "multe", Number(f.importo));
  const costRows = [...byStation.values()].map((r) => ({
    ...r,
    canone: Math.round(r.canone),
    danni: Math.round(r.danni),
    carburante: Math.round(r.carburante),
    pedaggi: Math.round(r.pedaggi),
    multe: Math.round(r.multe),
  }));
  const totVeicoli = costRows.reduce((s, r) => s + r.veicoli, 0);
  const totCanone = costRows.reduce((s, r) => s + r.canone, 0);
  const totTransazionale = costRows.reduce((s, r) => s + r.danni + r.carburante + r.pedaggi + r.multe, 0);

  // due appalti distinti: subtotale Amazon separato dal totale complessivo,
  // mostrato solo quando entrambi gli appalti compaiono nella vista corrente
  // (non ha senso in una vista già filtrata su una singola stazione)
  const amazonRows = costRows.filter((r) => isAmazon(r.station));
  const altriRows = costRows.filter((r) => !isAmazon(r.station));
  const showAppaltoSplit = amazonRows.length > 0 && altriRows.length > 0;
  const sumBy = <K extends keyof CostRow>(rows: CostRow[], key: K) =>
    rows.reduce((s, r) => s + (r[key] as number), 0);

  const scopeLabel = stationFilter
    ? `stazione ${stations.find((s) => s.id === stationFilter)?.code}`
    : `cluster (${stations.length} stazioni)`;

  // propaga il filtro stazione selezionato ai link di drill-down (KPI, tabella costi)
  const withStation = (href: string) =>
    stationFilter ? `${href}${href.includes("?") ? "&" : "?"}station=${stationFilter}` : href;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Vista ${scopeLabel} · ultimi 30 giorni salvo diversa indicazione · ogni numero è cliccabile fino alla riga sorgente`}
        action={
          isAdmin ? (
            <div className="flex gap-2">
              <StationFilter stations={stations} value={stationFilter ?? ""} />
              <ExportExcelButton stationId={stationFilter} />
            </div>
          ) : undefined
        }
      />

      {/* KPI — ogni numero è cliccabile fino alla riga sorgente */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Veicoli in flotta" value={veicoliFlotta.length} href={withStation("/vehicles")}
          source="Vehicle, non dismessi e non sostitutivi (i sostitutivi coprono un guasto già conteggiato, non sono capacità in più)" />
      </div>

      {/* veicoli e canone per stazione — prima cosa da vedere, sempre visibile senza scroll */}
      <section className="card p-5 mb-6">
        <h2 className="font-semibold mb-3">Veicoli per stazione</h2>
        <div className="overflow-x-auto">
          <table className="table-base max-w-2xl">
            <thead><tr><th>Stazione</th><th>Veicoli</th><th>Canone mensile</th></tr></thead>
            <tbody>
              {amazonRows.map((r) => (
                <tr key={r.stationId}>
                  <td>
                    <Link className="text-brand hover:underline" href={`/vehicles?station=${r.stationId}`}>{r.station}</Link>
                  </td>
                  <td className="font-semibold">{r.veicoli}</td>
                  <td>{fmtEur(r.canone)}</td>
                </tr>
              ))}
              {showAppaltoSplit && (
                <tr className="border-t border-line font-semibold bg-surface-sunken">
                  <td>Subtotale Amazon</td>
                  <td>{sumBy(amazonRows, "veicoli")}</td>
                  <td>{fmtEur(sumBy(amazonRows, "canone"))}</td>
                </tr>
              )}
              {altriRows.map((r) => (
                <tr key={r.stationId}>
                  <td>
                    <Link className="text-brand hover:underline" href={`/vehicles?station=${r.stationId}`}>{r.station}</Link>
                  </td>
                  <td className="font-semibold">{r.veicoli}</td>
                  <td>{fmtEur(r.canone)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line font-semibold">
                <td>{showAppaltoSplit ? "Totale (tutti gli appalti)" : "Totale"}</td>
                <td>{totVeicoli}</td>
                <td>{fmtEur(totCanone)}</td>
              </tr>
            </tbody>
          </table>
          <SourceNote>
            tabella Vehicle, non dismessi e non sostitutivi, per stazione{stationFilter ? ` (${scopeLabel})` : ""} — canone: impegno mensile corrente, non una spesa "ultimi 30gg"; i sostitutivi coprono un guasto già conteggiato, non sono capacità in più
            {showAppaltoSplit ? " · Amazon e altri appalti (es. GLS) sempre distinti, mai sommati come un unico cliente" : ""}
          </SourceNote>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Costi per stazione — ultimi 30 giorni</h2>
        <p className="text-xs text-ink-muted mb-2">
          Totale {fmtEur(totTransazionale)} · le stazioni non si compensano mai tra loro · click su una barra per la vista di stazione
        </p>

        {totTransazionale === 0 && (
          <p className="mb-3 text-sm text-ink-muted bg-surface rounded-control px-3 py-2 border border-line">
            Nessun costo (danni/carburante/pedaggi/multe) registrato negli ultimi 30 giorni per {scopeLabel}.{" "}
            <Link href="/import" className="text-brand underline">Carica fatture/transazioni del mese →</Link>
          </p>
        )}

        <CostByStationChart data={costRows} />
        {/* tabella dettaglio = "relief" per le serie a basso contrasto + drill-down */}
        <div className="overflow-x-auto mt-3">
          <table className="table-base">
            <thead>
              <tr><th>Stazione</th><th>Danni</th><th>Carburante</th><th>Pedaggi</th><th>Multe</th><th>Totale</th><th>Dettaglio</th></tr>
            </thead>
            <tbody>
              {amazonRows.map((r) => (
                <CostTableRow key={r.stationId} r={r} />
              ))}
              {showAppaltoSplit && (
                <tr className="border-t border-line font-semibold bg-surface-sunken">
                  <td>Subtotale Amazon</td>
                  <td>{fmtEur(sumBy(amazonRows, "danni"))}</td>
                  <td>{fmtEur(sumBy(amazonRows, "carburante"))}</td>
                  <td>{fmtEur(sumBy(amazonRows, "pedaggi"))}</td>
                  <td>{fmtEur(sumBy(amazonRows, "multe"))}</td>
                  <td>{fmtEur(sumBy(amazonRows, "danni") + sumBy(amazonRows, "carburante") + sumBy(amazonRows, "pedaggi") + sumBy(amazonRows, "multe"))}</td>
                  <td></td>
                </tr>
              )}
              {altriRows.map((r) => (
                <CostTableRow key={r.stationId} r={r} />
              ))}
              <tr className="border-t-2 border-line font-semibold">
                <td>{showAppaltoSplit ? "Totale (tutti gli appalti)" : "Totale"}</td>
                <td>{fmtEur(costRows.reduce((s, r) => s + r.danni, 0))}</td>
                <td>{fmtEur(costRows.reduce((s, r) => s + r.carburante, 0))}</td>
                <td>{fmtEur(costRows.reduce((s, r) => s + r.pedaggi, 0))}</td>
                <td>{fmtEur(costRows.reduce((s, r) => s + r.multe, 0))}</td>
                <td>{fmtEur(totTransazionale)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <SourceNote>
          Damage.costoStimato + FuelTransaction.importo (per PAN→veicolo) + TollTransaction.importo + Fine.importo, dal {since.toLocaleDateString("it-IT")} al {oggi.toLocaleDateString("it-IT")}, aggregati per stazione del veicolo — manutenzione non è una voce a parte perché sempre inclusa nel canone (vedi tabella veicoli sopra), canone mensile non incluso qui perché non è una spesa del periodo
          {showAppaltoSplit ? " · Amazon e altri appalti (es. GLS) sempre distinti, mai sommati come un unico cliente" : ""}
        </SourceNote>
      </section>
    </div>
  );
}
