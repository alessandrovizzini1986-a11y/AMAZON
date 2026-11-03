/**
 * Dal risultato del controllo settimanale alle viste per la pagina, l'Excel,
 * i messaggi Teams e il salvataggio: riepilogo per station, alert driver×giorno,
 * domeniche / giorni consecutivi.
 */
import { righePerDriver, type EsitoSettimanale, type RigaDriver, type TrackingInput } from "./controlloSettimanale";

const ALERT_CAT = ["+1", "-1", "H", "A", "ORE", "ACC"] as const;
import { leggiLavoratori, oreLavoro } from "./lavoratori";
import { controlloDomenica } from "./domeniche";
import { daysBetween, g, weekday } from "./grid";
import { componi, ddmm, TESTI, type Messaggio, type Sezione } from "./messaggi";
import { IND_EUR, type Station } from "./regole";

export type RiepilogoStation = {
  station: Station; driver: number; trasferte: number; rotte: number;
  piu1: number; meno1: number; h: number; a: number; ore: number; acc: number; eurPiu1: number; giorniSenzaCsv: string;
};

export type AlertRiga = {
  station: Station; tipo: string; driver: string; driverId: string; data: string; categoria: string;
  ore: number; trasferta: number; pacchi: number | null; riposo: string; nota: string;
};

export type DomenicaRigaSett = {
  station: Station; tipo: "SIC" | "STD"; lavoratore: string; contratto: string;
  ore: Record<string, number>; giorniLavorati: number; seiPiuDom: string[]; maxConsecutivi: number;
  consecDal: string; consecAl: string; oltre6: boolean;
};

export function riepilogoStation(e: EsitoSettimanale): RiepilogoStation {
  const d = e.dettaglio.filter((r) => r.categoria !== "?");
  const piu1 = d.filter((r) => r.categoria === "+1").length;
  return {
    station: e.station,
    driver: new Set(e.dettaglio.map((r) => r.driverId)).size,
    trasferte: d.reduce((s, r) => s + r.trasferta, 0),
    rotte: d.reduce((s, r) => s + r.inRotta, 0),
    piu1, meno1: d.filter((r) => r.categoria === "-1").length, h: d.filter((r) => r.categoria === "H").length,
    a: e.nonInTracking.filter((n) => n.categoria === "A").length,
    ore: e.dettaglio.filter((r) => r.extra.some((x) => x.cat === "ORE")).length,
    acc: e.dettaglio.filter((r) => r.extra.some((x) => x.cat === "ACC")).length,
    eurPiu1: piu1 * IND_EUR,
    giorniSenzaCsv: e.giorniSenzaCsv.map(ddmm).join(", "),
  };
}

export function alertRighe(e: EsitoSettimanale): AlertRiga[] {
  const out: AlertRiga[] = e.dettaglio.flatMap((r) => {
    const base = { station: e.station, tipo: r.tipo, driver: r.driver, driverId: r.driverId.startsWith("NOID|") ? "" : r.driverId, data: r.data, ore: r.ore, trasferta: r.trasferta, pacchi: r.pacchi, riposo: r.riposo };
    return [
      ...(["+1", "-1", "H"].includes(r.categoria) ? [{ ...base, categoria: r.categoria, nota: r.nota }] : []),
      ...r.extra.map((x) => ({ ...base, categoria: x.cat, nota: x.nota })),
    ];
  });
  for (const n of e.nonInTracking.filter((x) => x.categoria === "A")) {
    out.push({ station: e.station, tipo: "AMAZON", driver: n.driver, driverId: n.driverId, data: n.data, categoria: "A", ore: 0, trasferta: 0, pacchi: n.pacchi, riposo: "", nota: n.nota });
  }
  return out.sort((x, y) => x.driver.localeCompare(y.driver) || x.data.localeCompare(y.data));
}

/** Domeniche e consecutivi per i driver SIC e STD della station (consecutivi sul mese intero). */
export function domenicheStation(station: Station, tracking: TrackingInput[], da: string, a: string): DomenicaRigaSett[] {
  const anno = Number(a.slice(0, 4));
  const mese = Number(a.slice(5, 7));
  const periodo = daysBetween(da, a);
  const out: DomenicaRigaSett[] = [];
  for (const t of tracking.filter((x) => x.station === station)) {
    let lav;
    try { lav = leggiLavoratori(t.sheets, anno, mese).lavoratori; } catch { continue; }
    for (const l of lav) {
      const ore: Record<string, number> = {};
      for (const d of periodo) {
        const h = oreLavoro(l, d);
        if (h) ore[d] = Math.round(h * 100) / 100;
      }
      const c = controlloDomenica(l, anno, mese);
      const seiPiuDom = periodo.filter((d) => weekday(d) === 6 && d.slice(0, 7) === a.slice(0, 7) && c.seiPiuDom[Number(d.slice(8))] === 1);
      const iso = (day: number) => `${a.slice(0, 7)}-${String(day).padStart(2, "0")}`;
      out.push({
        station, tipo: t.tipo, lavoratore: l.nome, contratto: l.contratto, ore,
        giorniLavorati: Object.keys(ore).length, seiPiuDom, maxConsecutivi: c.maxConsecutivi,
        consecDal: c.maxConsecutivi ? iso(c.consecDal) : "", consecAl: c.maxConsecutivi ? iso(c.consecAl) : "",
        oltre6: c.maxConsecutivi >= 7,
      });
    }
  }
  return out;
}

/** Messaggio Teams per la station (vuoto se nessuna anomalia). */
export function messaggioSettimanale(e: EsitoSettimanale, referente: string | null, entro: string): Messaggio {
  const alert = alertRighe(e);
  const per = (cat: string) => {
    const m = new Map<string, AlertRiga[]>();
    for (const r of alert.filter((x) => x.categoria === cat)) m.set(r.driver + "|" + r.driverId, [...(m.get(r.driver + "|" + r.driverId) ?? []), r]);
    return [...m.values()];
  };
  const sezioni: Sezione[] = [
    { titolo: TESTI.piu1, colonne: ["Driver", "Giorni", "Ore", "Cosa chiediamo"], righe: per("+1").map((rs) => [rs[0].driver, rs.map((r) => ddmm(r.data)).join(", "), rs.map((r) => g(r.ore)).join(", "), TESTI.chiedi.piu1]) },
    { titolo: TESTI.meno1, colonne: ["Driver", "Giorni", "Pacchi Amazon", "Cosa chiediamo"], righe: per("-1").map((rs) => [rs[0].driver, rs.map((r) => ddmm(r.data)).join(", "), rs.map((r) => String(r.pacchi ?? "")).join(", "), TESTI.chiedi.meno1]) },
    { titolo: TESTI.h, colonne: ["Driver", "Giorni", "Ore", "Cosa chiediamo"], righe: per("H").map((rs) => [rs[0].driver, rs.map((r) => ddmm(r.data)).join(", "), rs.map((r) => g(r.ore)).join(", "), TESTI.chiedi.h]) },
    { titolo: TESTI.a, colonne: ["Driver", "ID", "Giorni", "Pacchi", "Nota"], righe: per("A").map((rs) => [rs[0].driver, rs[0].driverId, rs.map((r) => ddmm(r.data)).join(", "), rs.map((r) => String(r.pacchi ?? "")).join(", "), rs[0].nota]) },
    { titolo: TESTI.ore, colonne: ["Driver", "Giorni", "Cosa abbiamo letto", "Cosa chiediamo"], righe: per("ORE").map((rs) => [rs[0].driver, rs.map((r) => ddmm(r.data)).join(", "), rs.map((r) => `${ddmm(r.data)}: ${r.nota.replace(/: verificare e correggere il tracking$/, "")}`).join("; "), TESTI.chiedi.ore]) },
    { titolo: TESTI.acc, colonne: ["Driver", "Domeniche", "Ore Accordo", "Cosa chiediamo"], righe: per("ACC").map((rs) => [rs[0].driver, rs.map((r) => ddmm(r.data)).join(", "), rs.map((r) => (r.nota.match(/: ([\d.,]+) h nella riga/)?.[1] ?? "")).join(", "), TESTI.chiedi.acc]) },
  ];
  return componi(e.station, TESTI.aperturaSettimanale(TESTI.saluto(referente), e.station, ddmm(e.da), ddmm(e.a), entro), sezioni);
}

/** Righe da salvare: una per driver e categoria di anomalia. */
export function risultatiDaSalvare(e: EsitoSettimanale) {
  const rows = righePerDriver(e);
  const alert = alertRighe(e);
  const out: { station: Station; tipo: string; driver: string; driverId: string; categoria: string; giorni: unknown[]; oreTracking: number; trasferte: number; rotte: number; nota: string }[] = [];
  for (const cat of ALERT_CAT) {
    const by = new Map<string, AlertRiga[]>();
    for (const r of alert.filter((x) => x.categoria === cat)) by.set(`${r.tipo}|${r.driver}|${r.driverId}`, [...(by.get(`${r.tipo}|${r.driver}|${r.driverId}`) ?? []), r]);
    for (const rs of by.values()) {
      const rd: RigaDriver | undefined = rows.find((x) => x.driver === rs[0].driver && x.tipo === rs[0].tipo);
      out.push({
        station: e.station, tipo: rs[0].tipo, driver: rs[0].driver, driverId: rs[0].driverId, categoria: cat,
        giorni: rs.map((r) => ({ data: r.data, ore: r.ore, trasferta: r.trasferta, pacchi: r.pacchi, riposo: r.riposo })),
        oreTracking: rs.reduce((s, r) => s + r.ore, 0), trasferte: rd?.trasferte ?? 0, rotte: rd?.rotte ?? rs.length,
        nota: rs[0].nota.slice(0, 2000),
      });
    }
  }
  return out;
}
