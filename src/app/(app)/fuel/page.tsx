import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getConfigNumber } from "@/lib/config";
import { consumoL100km, isConsumoAnomalo } from "@/domain/fuel";
import { PageHeader, StatusBadge, SourceNote, EmptyState } from "@/components/ui";
import { fmtEur, fmtKm, fmtNum, fmtDate } from "@/lib/format";
import { assignFuelCardAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FuelPage() {
  const user = await requireUser();
  assertCan(user, "fuel.manage");
  const scope = stationScope(user);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [cards, vehicles, tollsByStation, consumoAtteso, tolleranza] = await Promise.all([
    db.fuelCard.findMany({
      where: scope.stationId ? { OR: [{ vehicle: { stationId: scope.stationId } }, { vehicleId: null }] } : {},
      include: {
        vehicle: { include: { station: true } },
        transactions: { where: { data: { gte: since } }, orderBy: { data: "desc" } },
      },
      orderBy: { pan: "asc" },
    }),
    db.vehicle.findMany({
      where: { ...(scope.stationId ? { stationId: scope.stationId } : {}), stato: { not: "DISMESSO" } },
      orderBy: { targa: "asc" },
      select: { id: true, targa: true },
    }),
    db.tollTransaction.groupBy({
      by: ["stationId"],
      where: { data: { gte: since }, ...(scope.stationId ? { stationId: scope.stationId } : {}) },
      _sum: { importo: true },
      _count: true,
    }),
    getConfigNumber("fuel.consumo.atteso.l100km"),
    getConfigNumber("fuel.consumo.tolleranza"),
  ]);

  const stations = await db.station.findMany({ orderBy: { code: "asc" } });
  const stationName = (id: string) => stations.find((s) => s.id === id)?.code ?? id;

  // km percorsi negli ultimi 30 giorni per veicolo (da check-in/out completati)
  const assignments = await db.assignment.findMany({
    where: { date: { gte: since }, checkOutKm: { not: null }, checkInKm: { not: null } },
    select: { vehicleId: true, checkInKm: true, checkOutKm: true },
  });
  const kmByVehicle = new Map<string, number>();
  for (const a of assignments) {
    kmByVehicle.set(a.vehicleId, (kmByVehicle.get(a.vehicleId) ?? 0) + ((a.checkOutKm ?? 0) - (a.checkInKm ?? 0)));
  }

  const rows = cards.map((card) => {
    const litri = card.transactions.reduce((s, t) => s + Number(t.litri), 0);
    const spesa = card.transactions.reduce((s, t) => s + Number(t.importo), 0);
    const km = card.vehicleId ? kmByVehicle.get(card.vehicleId) ?? 0 : 0;
    const consumo = consumoL100km(litri, km);
    const anomalo = isConsumoAnomalo({ consumoRilevato: consumo, consumoAtteso, tolleranza });
    return { card, litri, spesa, km, consumo, anomalo };
  });

  const anomalie = rows.filter((r) => r.anomalo).length;
  const totSpesa = rows.reduce((s, r) => s + r.spesa, 0);
  const totPedaggi = tollsByStation.reduce((s, t) => s + Number(t._sum.importo ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Fuel & Pedaggi"
        subtitle={`Ultimi 30 giorni · riconciliazione per PAN carta (mai per targa) · consumo atteso ${consumoAtteso} l/100km ± ${Math.round(tolleranza * 100)}% (configurabile)`}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Spesa carburante 30gg</div>
          <div className="text-2xl font-bold">{fmtEur(totSpesa)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Pedaggi 30gg</div>
          <div className="text-2xl font-bold">{fmtEur(totPedaggi)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold text-ink-muted uppercase">Anomalie consumo</div>
          <div className={`text-2xl font-bold ${anomalie > 0 ? "text-danger" : "text-ok"}`}>{anomalie}</div>
        </div>
      </div>

      <section className="card overflow-x-auto mb-6">
        <div className="p-4 pb-0 flex items-center justify-between">
          <h2 className="font-semibold">Riconciliazione consumi per carta</h2>
          <p className="text-xs text-ink-muted">Import mensile Q8 da <Link href="/import" className="text-brand underline">Import dati</Link></p>
        </div>
        {rows.length === 0 ? (
          <div className="p-4"><EmptyState message="Nessuna fuel card registrata. Importa le transazioni Q8." /></div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>PAN carta</th><th>Veicolo</th><th>Litri 30gg</th><th>Spesa 30gg</th>
                <th>Km 30gg (check-in/out)</th><th>Consumo l/100km</th><th>Esito</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ card, litri, spesa, km, consumo, anomalo }) => (
                <tr key={card.id} className={anomalo ? "bg-danger-soft" : ""}>
                  <td className="font-mono text-xs">{card.pan}</td>
                  <td>
                    <form action={assignFuelCardAction.bind(null, card.id)} className="flex items-center gap-1">
                      <select className="input py-1 text-xs font-mono max-w-36" name="vehicleId" defaultValue={card.vehicleId ?? ""}>
                        <option value="">— non associata —</option>
                        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.targa}</option>)}
                      </select>
                      <button className="btn-secondary py-1 px-2 text-xs">ok</button>
                    </form>
                  </td>
                  <td>{fmtNum(litri, 1)} l</td>
                  <td>{fmtEur(spesa)}</td>
                  <td>{fmtKm(km)}</td>
                  <td className="font-semibold">{consumo === null ? "n/d" : fmtNum(consumo, 1)}</td>
                  <td>
                    {consumo === null ? (
                      <StatusBadge tone="neutral">km insufficienti</StatusBadge>
                    ) : anomalo ? (
                      <StatusBadge tone="danger">anomalia</StatusBadge>
                    ) : (
                      <StatusBadge tone="ok">in linea</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-3 pb-3">
          <SourceNote>
            litri/spesa: FuelTransaction per PAN (ultimi 30gg) · km: somma (checkOutKm − checkInKm) da Assignment · soglie da AppConfig
          </SourceNote>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold mb-3">Pedaggi per stazione (30gg)</h2>
        {tollsByStation.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessun pedaggio importato. Usa Import dati → Pedaggi/Telepass.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base max-w-xl">
              <thead><tr><th>Stazione</th><th>Transazioni</th><th>Totale</th></tr></thead>
              <tbody>
                {tollsByStation.map((t) => (
                  <tr key={t.stationId}>
                    <td>{stationName(t.stationId)}</td>
                    <td>{t._count}</td>
                    <td className="font-semibold">{fmtEur(Number(t._sum.importo ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SourceNote>tabella TollTransaction, aggregata per stazione, dal {fmtDate(since)} — le stazioni non si compensano mai tra loro</SourceNote>
          </div>
        )}
      </section>
    </div>
  );
}
