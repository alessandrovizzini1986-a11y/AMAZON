import "server-only";
import { dsAmazon } from "@/domain/fatture/fatturato";
import { db } from "@/lib/db";
import { calibra, finestra, type Calibrazione, type RigaCalibrazione } from "@/domain/forecast/tariffe";
import { confronta, perMese, prevedi, type Backtest, type Previsione, type RigaForecast } from "@/domain/forecast/previsione";
import { addGiorni, chiusa, inizioSettimana } from "@/domain/forecast/settimane";
import { versioniForecast } from "@/lib/forecastVersioni";
import { statoAlla } from "@/domain/forecast/storico";
import { mesiStima, stimaMese, type RigaStimaMese } from "@/domain/forecast/stimaMese";

export type DatiForecast = {
  oggi: string; n: number; cal: Calibrazione; previsione: (Previsione & { fatturato: number | null })[]; mesi: Record<string, Record<string, number>>;
  backtest: Backtest[]; nonMappate: number;
  /** stima del mese: fatturato + previsto per le settimane non ancora fatturate */
  stima: RigaStimaMese[];
};

/** Calibrazione, previsione delle settimane aperte e backtest delle settimane chiuse con forecast. */
export async function calcolaForecast(n: number, oggi: string): Promise<DatiForecast> {
  const [rotte, vers] = await Promise.all([db.forecastRoute.findMany({ select: { data: true, station: true, cycle: true, classe: true, routes: true, fileId: true } }), versioniForecast()]);
  // "ultimo" = per station, giorno e linea il file con versione più alta (settimana di emissione), poi caricato più tardi:
  // ricaricare un file vecchio non scavalca i nuovi e le classi sparite dalla versione nuova non sopravvivono
  const fc: RigaForecast[] = statoAlla(vers, rotte.map((r) => ({ fileId: r.fileId, data: r.data.toISOString().slice(0, 10), station: dsAmazon(r.station), cycle: r.cycle, classe: r.classe, routes: r.routes })), "9999-12-31")
    .map((r) => ({ data: r.data, station: r.station, classe: r.classe, routes: r.routes }));
  const primaData = fc.reduce((m, r) => (r.data < m ? r.data : m), addGiorni(oggi, -14));
  const daQuando = addGiorni(inizioSettimana(primaData), -7 * (n + 8));
  const mesi = mesiStima(oggi, fc.reduce<string | null>((m, r) => (m === null || r.data > m ? r.data : m), null));
  // righe dal più vecchio tra la finestra di calibrazione e lo stesso mese dell'anno prima (per il confronto)
  const daStima = `${Number(mesi[0].slice(0, 4)) - 1}${mesi[0].slice(4)}-01`;
  const da = daStima < daQuando ? daStima : daQuando;
  const linee = await db.amazonInvoiceLine.findMany({ where: { data: { gte: new Date(da + "T00:00:00Z") } }, select: { ds: true, data: true, classe: true, quantita: true, avere: true } });
  const righe: RigaCalibrazione[] = linee.map((l) => ({ ds: dsAmazon(l.ds), data: l.data.toISOString().slice(0, 10), classe: l.classe, quantita: l.quantita, avere: Number(l.avere) }));
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
  const stima = stimaMese({ righe, previsioni: prevedi(fc, cal), mesi });
  return { oggi, n, cal, previsione, mesi: perMese(previsione), backtest, stima, nonMappate: fc.filter((r) => r.classe === "NON_MAPPATO").reduce((s, r) => s + r.routes, 0) };
}
