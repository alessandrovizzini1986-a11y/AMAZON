/**
 * Telematica: dalla risposta "percorso del giorno" dei portali alla riga del giorno (km, orari, tempi, soste, rifornimenti)
 * e dalle righe dei giorni al riepilogo del mese per targa. Solo calcoli, niente rete né database.
 */
/** una guida (G) o una sosta (S) della giornata. Per occupare poco spazio: orari "HH:MM" italiani e indirizzo tagliato a 60 caratteri */
export type Tappa = { t: "G" | "S"; da: string; a: string; km: number; dove: string | null };
export const GIORNI_TAPPE = 120; // dopo questi giorni le tappe si cancellano, restano i numeri del giorno
const oraRoma = (iso: string) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const corto = (x: string | null | undefined) => (x ? (x.length > 60 ? x.slice(0, 59) + "…" : x) : null);
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
    return { t: guida ? "G" as const : "S" as const, da: oraRoma(s.dateBegin!), a: oraRoma(s.dateEnd!), km: r1(n(s.mileage)), dove: corto(guida ? s.formattedAddressEnd : s.formattedAddressBegin) };
  });
  const soste = giornataMezzo(tappe).soste; // soste di almeno 3 minuti tra la prima partenza e l'ultimo arrivo
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

// ───────────────────────── Giornata di consegna: cosa ha fatto un furgone, letto dalle sue tappe ─────────────────────────

const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const durataMin = (t: { da: string; a: string }) => Math.max(0, min(t.a) - min(t.da));
/** Targa spezza la giornata in tanti pezzi e chiama "uso" anche le fermate: una tappa senza km è una sosta. Pezzi uguali di fila si uniscono. */
export function tappeDelGiorno(tappe: Tappa[] | null | undefined): Tappa[] {
  const out: Tappa[] = [];
  for (const x of tappe ?? []) {
    const t: Tappa = { ...x, t: x.t === "S" || x.km < 0.05 ? "S" : "G" };
    const u = out[out.length - 1];
    if (u && u.t === t.t) { u.a = t.a; u.km = r1(u.km + t.km); if (t.t === "G") u.dove = t.dove ?? u.dove; else u.dove = u.dove ?? t.dove; }
    else out.push(t);
  }
  return out.filter((t) => t.t === "G" || durataMin(t) > 0 || t.dove);
}

/** Il posto senza numero civico: "Via Del Salice, Santarcangelo Di Romagna". Serve a capire se due soste sono nello stesso luogo. */
export function luogo(dove: string | null | undefined): string | null {
  if (!dove) return null;
  const parti = dove.replace(/…$/, "").split(",").map((p) => p.trim()).filter((p) => p && !/^\d+[a-z]?(\/\w+)?$/i.test(p));
  return parti.length ? parti.slice(0, 2).join(", ") : null;
}

/** Le basi di una station: i luoghi da cui parte almeno 1 furgone su 10 (il piazzale e, se c'è, il parcheggio accanto). */
export function basi(partenze: (string | null)[]): string[] {
  const n = new Map<string, number>();
  for (const p of partenze) if (p) n.set(p, (n.get(p) ?? 0) + 1);
  const tot = [...n.values()].reduce((a, b) => a + b, 0);
  return [...n.entries()].filter(([, c]) => tot > 0 && c / tot >= 0.1).sort((a, b) => b[1] - a[1]).map(([l]) => l);
}

/** `info` = da sapere ma non da controllare (per esempio il furgone è in officina) */
export type Avviso = { codice: "FUORI_BASE_SERA" | "FUORI_BASE_MATTINA" | "RIPARTE" | "VELOCITA" | "KM_ALTI" | "NOTTE" | "FERMO_ACCESO" | "OFFICINA"; testo: string; info?: boolean };
export type GiornataMezzo = {
  tappe: Tappa[]; partenza: string | null; rientro: string | null; fuoriMin: number; soste: number; sosteMin: number; sostaLunga: { min: number; dove: string | null; da: string } | null;
  parteDa: string | null; finisceA: string | null; riparte: { ora: string; km: number } | null;
};

/** Sosta "vera" in mezzo al giro: almeno 3 minuti. Le fermate più corte sono consegne al volo o semafori. */
export const SOSTA_MIN = 3;
/** sopra questa velocità il furgone va segnalato (130 è il limite in autostrada: un picco appena sopra non è una notizia) */
export const VEL_MAX_AVVISO = 140;

export function giornataMezzo(tappeGrezze: Tappa[] | null | undefined, basiStation: string[] = []): GiornataMezzo {
  const tappe = tappeDelGiorno(tappeGrezze);
  const ig = tappe.map((t, i) => (t.t === "G" ? i : -1)).filter((i) => i >= 0);
  if (!ig.length) return { tappe, partenza: null, rientro: null, fuoriMin: 0, soste: 0, sosteMin: 0, sostaLunga: null, parteDa: luogo(tappe[0]?.dove), finisceA: luogo(tappe[tappe.length - 1]?.dove), riparte: null };
  const primo = ig[0], ultimo = ig[ig.length - 1];
  const inMezzo = tappe.slice(primo, ultimo).filter((t) => t.t === "S" && durataMin(t) >= SOSTA_MIN);
  const lunga = [...inMezzo].sort((a, b) => durataMin(b) - durataMin(a))[0];
  // riparte dopo il rientro: è tornato alla base, è stato fermo almeno 45 minuti, poi ha fatto altri km
  let riparte: GiornataMezzo["riparte"] = null;
  let kmFatti = 0;
  for (let i = primo; i < ultimo; i++) {
    const t = tappe[i];
    if (t.t === "G") { kmFatti += t.km; continue; }
    const l = luogo(t.dove);
    if (kmFatti >= 20 && durataMin(t) >= 45 && l && basiStation.includes(l)) {
      const dopo = tappe.slice(i + 1).filter((x) => x.t === "G");
      const km = r1(dopo.reduce((a, x) => a + x.km, 0));
      if (km >= 5) { riparte = { ora: dopo[0].da, km }; break; }
    }
  }
  return {
    tappe, partenza: tappe[primo].da, rientro: tappe[ultimo].a, fuoriMin: Math.max(0, min(tappe[ultimo].a) - min(tappe[primo].da)), soste: inMezzo.length, sosteMin: inMezzo.reduce((a, t) => a + durataMin(t), 0),
    sostaLunga: lunga ? { min: durataMin(lunga), dove: lunga.dove, da: lunga.da } : null,
    parteDa: luogo(primo > 0 ? tappe[primo - 1].dove : tappe[primo].dove), finisceA: luogo(ultimo < tappe.length - 1 ? tappe[ultimo + 1].dove ?? tappe[ultimo].dove : tappe[ultimo].dove), riparte,
  };
}

const hm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
export const oreMinuti = hm;

/** Le cose da guardare su un furgone in un giorno. `medianaKm` = km tipici dei furgoni della station quel giorno. */
export function avvisiMezzo(x: { km: number; velMax: number | null; fermoMotoreAccSec: number }, g: GiornataMezzo, basiStation: string[], medianaKm: number, officine: string[] = []): Avviso[] {
  const a: Avviso[] = [];
  if (x.km < 1 || !g.partenza) return a;
  const conBasi = basiStation.length > 0;
  if (g.finisceA && officine.includes(g.finisceA)) a.push({ codice: "OFFICINA", testo: `La sera è in officina (${g.finisceA})`, info: true });
  else if (conBasi && g.finisceA && !basiStation.includes(g.finisceA)) a.push({ codice: "FUORI_BASE_SERA", testo: `La sera non è alla base: è fermo in ${g.finisceA}` });
  if (conBasi && g.parteDa && !basiStation.includes(g.parteDa) && !officine.includes(g.parteDa)) a.push({ codice: "FUORI_BASE_MATTINA", testo: `Non parte dalla base: parte da ${g.parteDa}` });
  if (g.riparte) a.push({ codice: "RIPARTE", testo: `Dopo il rientro alla base riparte alle ${g.riparte.ora} e fa altri ${g.riparte.km.toLocaleString("it-IT")} km` });
  if ((x.velMax ?? 0) > VEL_MAX_AVVISO) a.push({ codice: "VELOCITA", testo: `Velocità massima ${x.velMax} km/h` });
  if (medianaKm >= 30 && x.km > medianaKm * 1.8 && x.km - medianaKm >= 60) a.push({ codice: "KM_ALTI", testo: `${Math.round(x.km)} km: quasi il doppio dei ${Math.round(medianaKm)} km tipici della giornata` });
  if (g.rientro && (min(g.rientro) >= 22 * 60 || min(g.partenza) < 4 * 60)) a.push({ codice: "NOTTE", testo: `In movimento di notte (dalle ${g.partenza} alle ${g.rientro})` });
  if (x.fermoMotoreAccSec >= 3600) a.push({ codice: "FERMO_ACCESO", testo: `Fermo a motore acceso per ${hm(Math.round(x.fermoMotoreAccSec / 60))}` });
  return a;
}

export const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
