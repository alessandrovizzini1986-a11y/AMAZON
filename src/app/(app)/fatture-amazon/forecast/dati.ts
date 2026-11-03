import "server-only";
import { db } from "@/lib/db";
import { calibra, finestra, type Calibrazione, type RigaCalibrazione } from "@/domain/forecast/tariffe";
import { confronta, perMese, prevedi, ultimoForecast, type Backtest, type Previsione, type RigaForecast } from "@/domain/forecast/previsione";
import { addGiorni, chiusa, inizioSettimana } from "@/domain/forecast/settimane";
import { versioniForecast } from "@/lib/forecastVersioni";

export type DatiForecast = {
  oggi: string; n: number; cal: Calibrazione; previsione: (Previsione & { fatturato: number | null })[]; mesi: Record<string, Record<string, number>>;
  backtest: Backtest[]; nonMappate: number;
};

/** Calibrazione, previsione delle settimane aperte e backtest delle settimane chiuse con forecast. */
export async function calcolaForecast(n: number, oggi: string): Promise<DatiForecast> {
  const [rotte, vers] = await Promise.all([db.forecastRoute.findMany({ select: { data: true, station: true, classe: true, routes: true, fileId: true } }), versioniForecast()]);
  // "ultimo" = versione più alta (settimana di emissione), poi caricato più tardi: ricaricare un file vecchio non scavalca i nuovi
  const ord = new Map(vers.map((f) => [f.id, `${f.versione}|${f.caricatoIl}`]));
  const fc = ultimoForecast(rotte.map((r) => ({ data: r.data.toISOString().slice(0, 10), station: r.station, classe: r.classe, routes: r.routes, fileId: r.fileId, caricatoIl: ord.get(r.fileId) ?? "" })));
  const primaData = fc.reduce((m, r) => (r.data < m ? r.data : m), addGiorni(oggi, -14));
  const daQuando = addGiorni(inizioSettimana(primaData), -7 * (n + 8));
  const linee = await db.amazonInvoiceLine.findMany({ where: { data: { gte: new Date(daQuando + "T00:00:00Z") } }, select: { ds: true, data: true, classe: true, quantita: true, avere: true } });
  const righe: RigaCalibrazione[] = linee.map((l) => ({ ds: l.ds, data: l.data.toISOString().slice(0, 10), classe: l.classe, quantita: l.quantita, avere: Number(l.avere) }));
  const cal = calibra(righe, finestra(righe, n, oggi));

  const aperte = fc.filter((r) => !chiusa(inizioSettimana(r.data), oggi));
  const previsione = prevedi(aperte, cal).map((p) => {
    const reali = righe.filter((r) => r.ds === p.ds && inizioSettimana(r.data) === p.settimana);
    return { ...p, fatturato: reali.length ? Math.round(reali.reduce((s, r) => s + r.avere, 0) * 100) / 100 : null };
  });

  // backtest: per ogni settimana chiusa con forecast, tariffe dalla finestra che la precedeva
  const settChiuse = [...new Set(fc.map((r) => inizioSettimana(r.data)).filter((w) => chiusa(w, oggi)))].sort();
  const backtest: Backtest[] = [];
  for (const w of settChiuse) {
    const calW = calibra(righe, finestra(righe, n, oggi, w));
    const rw: RigaForecast[] = fc.filter((r) => inizioSettimana(r.data) === w);
    backtest.push(...confronta(prevedi(rw, calW), righe));
  }
  return { oggi, n, cal, previsione, mesi: perMese(previsione), backtest, nonMappate: fc.filter((r) => r.classe === "NON_MAPPATO").reduce((s, r) => s + r.routes, 0) };
}
