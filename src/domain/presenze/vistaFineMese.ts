/**
 * Dal risultato del controllo di fine mese ai messaggi Teams e alle righe da salvare.
 */
import type { EsitoFineMese } from "./controlloFineMese";
import { componi, ddmm, TESTI, type Messaggio, type Sezione } from "./messaggi";
import type { Station } from "./regole";

const MESI = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const nomeMese = (anno: number, mese: number) => `${MESI[mese]} ${anno}`;
const n2 = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");

export function stationsConDati(e: EsitoFineMese): Station[] {
  return [...new Set([...e.riepilogo.map((r) => r.station), ...e.domSic.map((d) => d.station)])];
}

export function messaggioFineMese(e: EsitoFineMese, station: Station, referente: string | null, entro: string): Messaggio {
  const iso = (day: number) => `${e.anno}-${String(e.mese).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const seiDom = Object.entries(e.tabellaSeiPiuDom[station] ?? {}).flatMap(([dom, nomi]) => nomi.map((n) => [n, ddmm(iso(Number(dom)))]));
  const sezioni: Sezione[] = [
    {
      titolo: TESTI.delta, colonne: ["Lavoratore", "Giorno", "Ore tracking", "Ore Zucchetti", "Delta", "Cosa chiediamo"],
      righe: e.delta.filter((d) => d.station === station).map((d) => [d.lavoratore, ddmm(d.data), n2(d.oreTracking), n2(d.oreZucchetti), (d.delta > 0 ? "+" : "") + n2(d.delta), TESTI.chiedi.delta]),
    },
    {
      titolo: TESTI.nonAbbinati, colonne: ["Lavoratore", "Dove", "Matricola", "Nota"],
      righe: e.nonAbbinati.filter((x) => x.station === station).map((x) => [x.lavoratore, x.fonte === "TRACKING" ? "solo tracking" : "solo Zucchetti", x.matricola, x.nota]),
    },
    { titolo: TESTI.seiDom, colonne: ["Lavoratore", "Domenica"], righe: seiDom },
    {
      titolo: TESTI.consecutivi, colonne: ["Lavoratore", "Dal–al", "N. giorni"],
      righe: e.consecutivi.filter((c) => c.station === station).map((c) => [`${c.lavoratore} (${c.tipo})`, `${ddmm(c.dal)}–${ddmm(c.al)}`, String(c.giorni)]),
    },
  ];
  return componi(station, TESTI.aperturaFineMese(TESTI.saluto(referente), station, nomeMese(e.anno, e.mese), entro), sezioni);
}

/** Righe da salvare (una per lavoratore e tipo di anomalia). */
export function risultatiFineMese(e: EsitoFineMese) {
  type R = { station: Station; tipo: string; driver: string; driverId: string; categoria: string; giorni: unknown[]; oreTracking: number; trasferte: number; rotte: number; nota: string };
  const out: R[] = [];
  const iso = (day: number) => `${e.anno}-${String(e.mese).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const per = new Map<string, typeof e.delta>();
  for (const d of e.delta) per.set(`${d.station}|${d.matricola}`, [...(per.get(`${d.station}|${d.matricola}`) ?? []), d]);
  for (const ds of per.values()) {
    out.push({
      station: ds[0].station, tipo: "SIC", driver: ds[0].lavoratore, driverId: ds[0].matricola, categoria: "DELTA",
      giorni: ds.map((d) => ({ data: d.data, oreTracking: d.oreTracking, oreZucchetti: d.oreZucchetti, delta: d.delta, lettura: d.lettura })),
      oreTracking: ds.reduce((s, d) => s + d.oreTracking, 0), trasferte: 0, rotte: 0,
      nota: ds.map((d) => `${ddmm(d.data)}: ${d.lettura} (${d.delta > 0 ? "+" : ""}${d.delta} h)`).join(", "),
    });
  }
  for (const x of e.nonAbbinati) out.push({ station: x.station, tipo: x.fonte, driver: x.lavoratore, driverId: x.matricola, categoria: "NON_ABBINATO", giorni: [], oreTracking: x.oreMese, trasferte: 0, rotte: 0, nota: x.nota });
  for (const [st, t] of Object.entries(e.tabellaSeiPiuDom) as [Station, Record<number, string[]>][]) {
    const perNome = new Map<string, number[]>();
    for (const [dom, nomi] of Object.entries(t)) for (const n of nomi) perNome.set(n, [...(perNome.get(n) ?? []), Number(dom)]);
    for (const [n, doms] of perNome) out.push({ station: st, tipo: "SIC", driver: n, driverId: "", categoria: "6+DOM", giorni: doms.map((d) => ({ data: iso(d) })), oreTracking: 0, trasferte: 0, rotte: 0, nota: `6 giorni + domenica: ${doms.map((d) => ddmm(iso(d))).join(", ")}` });
  }
  for (const c of e.consecutivi) out.push({ station: c.station, tipo: c.tipo, driver: c.lavoratore, driverId: "", categoria: "CONSECUTIVI", giorni: [{ data: c.dal }, { data: c.al }], oreTracking: 0, trasferte: 0, rotte: 0, nota: `${c.giorni} giorni consecutivi dal ${ddmm(c.dal)} al ${ddmm(c.al)}` });
  return out;
}
