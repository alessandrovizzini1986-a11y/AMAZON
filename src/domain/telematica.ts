/**
 * Telematica: dalla risposta "percorso del giorno" dei portali alla riga del giorno (km, orari, tempi, soste, rifornimenti)
 * e dalle righe dei giorni al riepilogo del mese per targa. Solo calcoli, niente rete né database.
 */
export type Tappa = { t: "G" | "S"; da: string; a: string; km: number; dove: string | null };
export type GiornoMezzo = {
  km: number; inizio: string | null; fine: string | null; guidaSec: number; motoreSec: number; fermoMotoreAccSec: number;
  velMax: number | null; punteggioSicurezza: number | null; soste: number; rifornimenti: number; litri: number; kmContatore: number | null; autista: string | null; tappe: Tappa[];
};

const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** scarto italiano rispetto a UTC in quel giorno ("+01:00" d'inverno, "+02:00" con l'ora legale) */
export function fusoRoma(giorno: string): string {
  const mezzogiorno = new Date(`${giorno}T12:00:00Z`);
  const oraRoma = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(mezzogiorno));
  return `+0${oraRoma - 12}:00`;
}
/** il giorno italiano di un istante */
export const giornoRoma = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d);
export const piuGiorni = (giorno: string, k: number) => { const d = new Date(`${giorno}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
export const giorniDelMese = (mese: string) => { const tot = new Date(Date.UTC(Number(mese.slice(0, 4)), Number(mese.slice(5, 7)), 0)).getUTCDate(); return Array.from({ length: tot }, (_, i) => `${mese}-${String(i + 1).padStart(2, "0")}`); };

type PosTarga = { mileage?: number; refuel?: { refueledLiters?: number } | null };
type SegTarga = { dateBegin?: string; dateEnd?: string; mileage?: number; reportType?: string; driverName?: string | null; formattedAddressBegin?: string | null; formattedAddressEnd?: string | null; positions?: PosTarga[] };
type RottaTarga = {
  totalMileage?: number; dateUsageBegin?: string | null; dateUsageEnd?: string | null; totalDriveTime?: number; totalEngineOnTime?: number; totalParkEngineOnTime?: number;
  dailyMaximumSpeed?: number | null; drivingScore?: { safety?: { score?: number | null } | null } | null; usageSegments?: SegTarga[];
};

/** Targa: /route/{mezzo} di un giorno → riga del giorno. Le soste contate sono quelle in mezzo alla giornata (non la notte prima e dopo). */
export function giornoDaTarga(risposta: unknown): GiornoMezzo {
  const r = (risposta ?? {}) as RottaTarga;
  const seg = Array.isArray(r.usageSegments) ? r.usageSegments : [];
  const tappe: Tappa[] = seg.filter((s) => s.dateBegin && s.dateEnd).map((s) => {
    const guida = s.reportType !== "INACTIVITY";
    return { t: guida ? "G" as const : "S" as const, da: s.dateBegin!, a: s.dateEnd!, km: r1(n(s.mileage)), dove: (guida ? s.formattedAddressEnd : s.formattedAddressBegin) ?? null };
  });
  const guide = tappe.map((t, i) => (t.t === "G" ? i : -1)).filter((i) => i >= 0);
  const soste = guide.length ? tappe.slice(guide[0], guide[guide.length - 1]).filter((t) => t.t === "S").length : 0;
  const posizioni = seg.flatMap((s) => s.positions ?? []);
  const rif = posizioni.map((p) => n(p.refuel?.refueledLiters)).filter((l) => l > 0);
  const contatori = posizioni.map((p) => n(p.mileage)).filter((k) => k > 0);
  const km = n(r.totalMileage);
  return {
    km: r1(km), inizio: km > 0 ? r.dateUsageBegin ?? null : null, fine: km > 0 ? r.dateUsageEnd ?? null : null,
    guidaSec: Math.round(n(r.totalDriveTime)), motoreSec: Math.round(n(r.totalEngineOnTime)), fermoMotoreAccSec: Math.round(n(r.totalParkEngineOnTime)),
    velMax: r.dailyMaximumSpeed ?? null, punteggioSicurezza: r.drivingScore?.safety?.score ?? null, soste, rifornimenti: rif.length, litri: r1(rif.reduce((a, b) => a + b, 0)),
    kmContatore: contatori.length ? r1(Math.max(...contatori)) : null, autista: seg.map((s) => s.driverName).find(Boolean) ?? null, tappe,
  };
}

type MarcaFw = { lat?: number; lon?: number; speed?: number; dateTime?: string; place?: string; autista?: string; cronotachigrafo?: number; serbatoio_principale_litri?: number };
/** FlottaWeb: /gps/getpositions di un giorno → riga del giorno. I km sono la differenza del contachilometri tra primo e ultimo punto. */
export function giornoDaFlottaweb(risposta: unknown, giorno: string): GiornoMezzo {
  const r = (risposta ?? {}) as { tot_km?: number; markers?: MarcaFw[]; message?: MarcaFw[] };
  const punti = (Array.isArray(r.message) && r.message.length ? r.message : r.markers ?? []).filter((p) => p.dateTime);
  const fuso = fusoRoma(giorno), iso = (p: MarcaFw) => `${p.dateTime!.replace(" ", "T")}${fuso}`;
  const mossi = punti.filter((p) => n(p.speed) > 3);
  const conta = punti.map((p) => n(p.cronotachigrafo)).filter((k) => k > 0);
  const daContatore = conta.length > 1 ? Math.max(...conta) - Math.min(...conta) : 0;
  const km = n(r.tot_km) > 0 ? n(r.tot_km) : daContatore;
  const autista = punti.map((p) => p.autista).find((a) => a && a !== "-") ?? null;
  return {
    km: r1(km), inizio: mossi.length ? iso(mossi[0]) : null, fine: mossi.length ? iso(mossi[mossi.length - 1]) : null, guidaSec: 0, motoreSec: 0, fermoMotoreAccSec: 0,
    velMax: mossi.length ? Math.round(Math.max(...mossi.map((p) => n(p.speed)))) : null, punteggioSicurezza: null, soste: 0, rifornimenti: 0, litri: 0,
    kmContatore: conta.length ? r1(Math.max(...conta)) : null, autista, tappe: [],
  };
}

export type RigaGiorno = { fonte: string; targa: string; giorno: string; km: number; inizio: string | null; fine: string | null; guidaSec: number; motoreSec: number; fermoMotoreAccSec: number; velMax: number | null; punteggioSicurezza: number | null; soste: number; rifornimenti: number; litri: number };
export type RiepilogoTarga = {
  targa: string; fonte: string; station: string | null; giorniUsati: number; km: number; kmMedi: number; guidaOre: number; fermoMotoreAccOre: number; velMax: number | null;
  punteggio: number | null; soste: number; rifornimenti: number; litri: number; kmPerLitro: number | null; litri100km: number | null; primoGiorno: string | null; ultimoGiorno: string | null;
};

/** un mezzo ha "lavorato" in un giorno se ha fatto almeno 1 km */
export const usato = (g: { km: number }) => g.km >= 1;

/** Riepilogo del mese per targa: km totali e medi, ore, rifornimenti, consumo (solo se ci sono litri e km). */
export function riepilogoMese(righe: RigaGiorno[], stationDi: (targa: string) => string | null): RiepilogoTarga[] {
  const per = new Map<string, RigaGiorno[]>();
  for (const r of righe) { const k = `${r.fonte}|${r.targa}`; per.set(k, [...(per.get(k) ?? []), r]); }
  return [...per.values()].map((rr) => {
    const us = rr.filter(usato), km = rr.reduce((a, r) => a + r.km, 0), litri = rr.reduce((a, r) => a + r.litri, 0);
    const voti = us.map((r) => r.punteggioSicurezza).filter((p): p is number => p !== null);
    const vel = rr.map((r) => r.velMax ?? 0);
    const giorni = us.map((r) => r.giorno).sort();
    return {
      targa: rr[0].targa, fonte: rr[0].fonte, station: stationDi(rr[0].targa), giorniUsati: us.length, km: r1(km), kmMedi: us.length ? r1(km / us.length) : 0,
      guidaOre: r1(rr.reduce((a, r) => a + r.guidaSec, 0) / 3600), fermoMotoreAccOre: r1(rr.reduce((a, r) => a + r.fermoMotoreAccSec, 0) / 3600), velMax: Math.max(0, ...vel) || null,
      punteggio: voti.length ? r1(voti.reduce((a, b) => a + b, 0) / voti.length) : null, soste: rr.reduce((a, r) => a + r.soste, 0), rifornimenti: rr.reduce((a, r) => a + r.rifornimenti, 0), litri: r1(litri),
      kmPerLitro: litri > 0 && km > 0 ? r1(km / litri) : null, litri100km: litri > 0 && km > 0 ? r1((litri / km) * 100) : null, primoGiorno: giorni[0] ?? null, ultimoGiorno: giorni[giorni.length - 1] ?? null,
    };
  }).sort((a, b) => (a.station ?? "ZZ").localeCompare(b.station ?? "ZZ") || a.targa.localeCompare(b.targa));
}
