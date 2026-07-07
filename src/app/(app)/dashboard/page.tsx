import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigNumber, getConfigNumberArray } from "@/lib/config";
import { checkTagliando, checkRevisione } from "@/domain/maintenance";
import { giorniScoperti, importoStorno, isPraticaStagnante } from "@/domain/replacement";
import { PageHeader, KpiCard, SourceNote } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { CostByStationChart, FinesTrendChart, type CostRow, type WeekRow } from "./charts";

export const dynamic = "force-dynamic";

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

  const [stations, vehicles, sogliaGiorni, sogliaKm, sogliaStagnante] = await Promise.all([
    db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.vehicle.findMany({
      where: { stato: { not: "DISMESSO" }, ...(stationFilter ? { stationId: stationFilter } : {}) },
      include: { station: true },
    }),
    getConfigNumberArray("maint.alert.giorni"),
    getConfigNumberArray("maint.alert.km"),
    getConfigNumber("replacement.alert.giorniSenzaRisposta"),
  ]);

  const vehicleIds = vehicles.map((v) => v.id);
  const vehicleStation = new Map(vehicles.map((v) => [v.id, v.station.code]));

  const [services, fines, fuelTx, tolls, openCases, damagesOpen, finesDaAssegnare] = await Promise.all([
    db.serviceRecord.findMany({ where: { data: { gte: since }, vehicleId: { in: vehicleIds } }, select: { vehicleId: true, costo: true } }),
    db.fine.findMany({
      where: { dataOraInfrazione: { gte: new Date(oggi.getTime() - 56 * 86400000) }, vehicleId: { in: vehicleIds } },
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
    db.replacementCase.findMany({
      where: { stato: { in: ["APERTA", "INVIATA", "CONTESTATA"] }, vehicleId: { in: vehicleIds } },
      include: { vehicle: true },
    }),
    db.damage.count({ where: { chiuso: false, vehicleId: { in: vehicleIds } } }),
    db.fine.count({ where: { driverId: null, stato: { not: "ANNULLATA" }, vehicleId: { in: vehicleIds } } }),
  ]);

  // ---- KPI manutenzione (stessa logica del modulo tagliandi: fonte unica) ----
  let alertManutenzione = 0;
  for (const v of vehicles) {
    const t = checkTagliando({
      oggi, kmAttuali: v.kmAttuali,
      prossimoTagliandoData: v.prossimoTagliandoData, prossimoTagliandoKm: v.prossimoTagliandoKm,
      sogliaGiorni, sogliaKm,
    });
    const r = checkRevisione({ oggi, prossimaRevisione: v.prossimaRevisione, sogliaGiorni });
    if (t.urgency !== "ok" || r.urgency !== "ok") alertManutenzione++;
  }

  // ---- storno canone attivo ----
  let stornoAttivo = 0;
  let praticheStagnanti = 0;
  for (const c of openCases) {
    const giorni = c.giorniScoperti ?? giorniScoperti({
      dataIngressoOfficina: c.dataIngressoOfficina,
      dataRicezioneSostitutivo: c.dataRicezioneSostitutivo,
      dataRientroOriginale: c.dataRientroOriginale,
      oggi,
    });
    const canone = Number(c.canoneGiornoSnapshot ?? c.vehicle.canoneGiorno);
    stornoAttivo += c.importoStorno ? Number(c.importoStorno) : importoStorno(giorni, canone);
    if (isPraticaStagnante({ stato: c.stato, inviataAt: c.inviataAt, oggi, sogliaGiorni: sogliaStagnante })) praticheStagnanti++;
  }

  // ---- costi per stazione (mai compensati tra loro) ----
  const byStation = new Map<string, CostRow>();
  const stationList = stationFilter ? stations.filter((s) => s.id === stationFilter) : stations;
  for (const s of stationList) {
    byStation.set(s.code, { station: s.code, stationId: s.id, manutenzione: 0, carburante: 0, pedaggi: 0, multe: 0 });
  }
  const add = (code: string | undefined, key: "manutenzione" | "carburante" | "pedaggi" | "multe", v: number) => {
    if (!code) return;
    const row = byStation.get(code);
    if (row) row[key] += v;
  };
  for (const r of services) add(vehicleStation.get(r.vehicleId), "manutenzione", Number(r.costo));
  for (const t of fuelTx) add(t.fuelCard.vehicleId ? vehicleStation.get(t.fuelCard.vehicleId) : undefined, "carburante", Number(t.importo));
  for (const t of tolls) add(stations.find((s) => s.id === t.stationId)?.code, "pedaggi", Number(t.importo));
  for (const f of fines.filter((f) => f.dataOraInfrazione >= since)) add(vehicleStation.get(f.vehicleId), "multe", Number(f.importo));
  const costRows = [...byStation.values()].map((r) => ({
    ...r,
    manutenzione: Math.round(r.manutenzione),
    carburante: Math.round(r.carburante),
    pedaggi: Math.round(r.pedaggi),
    multe: Math.round(r.multe),
  }));
  const totCosti = costRows.reduce((s, r) => s + r.manutenzione + r.carburante + r.pedaggi + r.multe, 0);

  // ---- trend multe 8 settimane ----
  const weeks: WeekRow[] = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(oggi.getTime() - (w + 1) * 7 * 86400000);
    const end = new Date(oggi.getTime() - w * 7 * 86400000);
    const inWeek = fines.filter((f) => f.dataOraInfrazione >= start && f.dataOraInfrazione < end);
    weeks.push({
      settimana: `${start.getDate()}/${start.getMonth() + 1}`,
      multe: inWeek.length,
      importo: inWeek.reduce((s, f) => s + Number(f.importo), 0),
    });
  }

  const scopeLabel = stationFilter
    ? `stazione ${stations.find((s) => s.id === stationFilter)?.code}`
    : `cluster (${stations.length} stazioni)`;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Vista ${scopeLabel} · ultimi 30 giorni salvo diversa indicazione · ogni numero è cliccabile fino alla riga sorgente`}
        action={
          isAdmin ? (
            <div className="flex gap-2">
              <form method="get">
                <select className="input" name="station" defaultValue={stationFilter ?? ""} onChange={undefined}>
                  <option value="">Vista cluster</option>
                  {stations.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </form>
              <a href={`/api/export/monthly${stationFilter ? `?station=${stationFilter}` : ""}`} className="btn-secondary whitespace-nowrap">
                ⬇ Export Excel
              </a>
            </div>
          ) : undefined
        }
      />

      {isAdmin && (
        <script
          // submit del form al cambio select senza JS client dedicato
          dangerouslySetInnerHTML={{
            __html: `document.querySelector('select[name="station"]')?.addEventListener('change', e => e.target.form.submit());`,
          }}
        />
      )}

      {/* KPI row — ogni card dichiara la fonte e porta al drill-down */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Veicoli in flotta" value={vehicles.length} href="/vehicles"
          source="Vehicle, non dismessi" />
        <KpiCard label="Alert manutenzione" value={alertManutenzione} href="/maintenance?view=alerts"
          tone={alertManutenzione > 0 ? "danger" : "ok"}
          source="scadenzario doppia soglia (AppConfig)" />
        <KpiCard label="Multe da assegnare" value={finesDaAssegnare} href="/fines?assegnazione=da_assegnare"
          tone={finesDaAssegnare > 0 ? "warn" : "ok"}
          source="Fine con driverId nullo" />
        <KpiCard label="Storno canone attivo" value={fmtEur(stornoAttivo)} href="/replacements"
          tone="neutral"
          source="pratiche non chiuse, giorni×canone" />
        <KpiCard label="Pratiche senza risposta" value={praticheStagnanti} href="/replacements"
          tone={praticheStagnanti > 0 ? "danger" : "ok"}
          source={`inviate da >${sogliaStagnante}gg (AppConfig)`} />
        <KpiCard label="Danni aperti" value={damagesOpen} href="/damages"
          tone={damagesOpen > 0 ? "warn" : "ok"}
          source="Damage con chiuso=false" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="font-semibold">Costi per stazione — ultimi 30 giorni</h2>
          <p className="text-xs text-ink-muted mb-2">
            Totale {fmtEur(totCosti)} · le stazioni non si compensano mai tra loro · click su una barra per la vista di stazione
          </p>
          <CostByStationChart data={costRows} />
          {/* tabella dettaglio = "relief" per le serie a basso contrasto + drill-down */}
          <div className="overflow-x-auto mt-3">
            <table className="table-base">
              <thead>
                <tr><th>Stazione</th><th>Manutenzione</th><th>Carburante</th><th>Pedaggi</th><th>Multe</th><th>Totale</th><th>Dettaglio</th></tr>
              </thead>
              <tbody>
                {costRows.map((r) => (
                  <tr key={r.stationId}>
                    <td className="font-semibold">{r.station}</td>
                    <td>{fmtEur(r.manutenzione)}</td>
                    <td>{fmtEur(r.carburante)}</td>
                    <td>{fmtEur(r.pedaggi)}</td>
                    <td>{fmtEur(r.multe)}</td>
                    <td className="font-semibold">{fmtEur(r.manutenzione + r.carburante + r.pedaggi + r.multe)}</td>
                    <td className="text-xs whitespace-nowrap">
                      <Link className="text-brand underline" href={`/vehicles?station=${r.stationId}`}>flotta</Link>{" · "}
                      <Link className="text-brand underline" href={`/fines?station=${r.stationId}`}>multe</Link>{" · "}
                      <Link className="text-brand underline" href="/fuel">fuel</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceNote>
            ServiceRecord.costo + FuelTransaction.importo (per PAN→veicolo) + TollTransaction.importo + Fine.importo, dal {since.toLocaleDateString("it-IT")} al {oggi.toLocaleDateString("it-IT")}, aggregati per stazione del veicolo
          </SourceNote>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Multe per settimana — ultime 8 settimane</h2>
          <p className="text-xs text-ink-muted mb-2">
            Conteggio verbali per settimana di infrazione · <Link href="/fines" className="text-brand underline">apri elenco completo →</Link>
          </p>
          <FinesTrendChart data={weeks} />
          <SourceNote>tabella Fine per dataOraInfrazione, bucket settimanali, ambito {scopeLabel}</SourceNote>
        </section>
      </div>
    </div>
  );
}
