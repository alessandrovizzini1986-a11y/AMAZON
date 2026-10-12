/**
 * Ordini di furgoni nuovi presso il noleggiatore (Ayvens per GLS):
 * lettura dell'export "Lista Ordini" e riepilogo per settimana.
 * Logica pura (niente DB) — testata in tests/orders.test.ts.
 */

export type OrderInput = {
  refOrdine: string;
  targa: string | null;
  statoFornitore: string;
  previstaConsegna: Date | null;
  dataRitiro: Date | null;
  marchio: string | null;
  modello: string | null;
  puntoRitiro: string | null;
  indirizzoRitiro: string | null;
  telaio: string | null;
};

/** Ritirato = data ritiro già passata; fissato = data ritiro futura; in arrivo = nessuna data ritiro. */
export type OrderPhase = "RITIRATO" | "RITIRO_FISSATO" | "IN_ARRIVO";

export const PHASE_LABEL: Record<OrderPhase, string> = {
  RITIRATO: "Ritirato",
  RITIRO_FISSATO: "Ritiro fissato",
  IN_ARRIVO: "In arrivo",
};

const DAY = 86_400_000;

/** Data a mezzanotte UTC (le date dei file non hanno ora: si confrontano solo i giorni). */
function utcDay(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/**
 * Le colonne data del file sono miste: date vere, testo "19/10/2026",
 * testo ISO "2026-08-05T00:00:00+02:00", celle vuote o "#VALUE!".
 */
export function parseOrderDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : utcDay(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // numero seriale Excel (giorni dal 30/12/1899)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * DAY);
    return utcDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return utcDay(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utcDay(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.startsWith("#") ? null : s;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Colonne dell'export Ayvens → campi ordine (intestazioni confrontate senza spazi/maiuscole). */
const COLUMNS: Record<Exclude<keyof OrderInput, "refOrdine">, string[]> = {
  targa: ["targa"],
  statoFornitore: ["stato"],
  previstaConsegna: ["previstaconsegna"],
  dataRitiro: ["dataritiro"],
  marchio: ["marchio"],
  modello: ["modello"],
  puntoRitiro: ["puntodiritirodelveicolo", "puntoritiro"],
  indirizzoRitiro: ["indirizzoservicepointcittaritirodelveicolo", "indirizzoservicepoint"],
  telaio: ["telaio"],
};

/** Righe del foglio (prima riga = intestazioni) → ordini; scarta righe senza numero ordine. */
export function mapAyvensRows(headers: unknown[], rows: unknown[][]): OrderInput[] {
  const h = headers.map((x) => norm(String(x ?? "")));
  const col = (names: string[]) => h.findIndex((x) => names.includes(x));
  const iRef = col(["refordine"]) >= 0 ? col(["refordine"]) : col(["idordine"]);
  if (iRef < 0) throw new Error("Colonna Ref_Ordine/Id_Ordine non trovata: è l'export \"Lista Ordini\" di Ayvens?");
  const idx = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, col(names)])) as Record<keyof typeof COLUMNS, number>;
  const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);

  const out = new Map<string, OrderInput>();
  for (const r of rows) {
    const ref = text(get(r, iRef))?.replace(/\.0$/, "");
    if (!ref) continue;
    out.set(ref, {
      refOrdine: ref,
      targa: text(get(r, idx.targa))?.replace(/\s+/g, "").toUpperCase() ?? null,
      statoFornitore: text(get(r, idx.statoFornitore)) ?? "—",
      previstaConsegna: parseOrderDate(get(r, idx.previstaConsegna)),
      dataRitiro: parseOrderDate(get(r, idx.dataRitiro)),
      marchio: text(get(r, idx.marchio)),
      modello: text(get(r, idx.modello)),
      puntoRitiro: text(get(r, idx.puntoRitiro)),
      indirizzoRitiro: text(get(r, idx.indirizzoRitiro)),
      telaio: text(get(r, idx.telaio)),
    });
  }
  return [...out.values()];
}

export function orderPhase(o: { dataRitiro: Date | null }, today: Date): OrderPhase {
  if (!o.dataRitiro) return "IN_ARRIVO";
  return o.dataRitiro.getTime() <= today.getTime() ? "RITIRATO" : "RITIRO_FISSATO";
}

/** Settimana ISO (lunedì–domenica), come la WEEK del file. */
export function isoWeek(d: Date): { year: number; week: number; monday: Date; sunday: Date } {
  const day = (d.getUTCDay() + 6) % 7; // 0 = lunedì
  const monday = new Date(d.getTime() - day * DAY);
  const thursday = new Date(monday.getTime() + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY);
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * DAY)) + 1;
  return { year, week, monday, sunday: new Date(monday.getTime() + 6 * DAY) };
}

/** Data di riferimento dell'ordine: la data ritiro se c'è, altrimenti la consegna prevista. */
export function orderRefDate(o: { dataRitiro: Date | null; previstaConsegna: Date | null }): Date | null {
  return o.dataRitiro ?? o.previstaConsegna;
}

export type WeekRecapRow = {
  key: string; // "2026-W42" oppure "nd"
  year: number | null;
  week: number | null;
  monday: Date | null;
  sunday: Date | null;
  ritirati: number;
  fissati: number;
  inArrivo: number;
  totale: number;
};

export function weekRecap(orders: { dataRitiro: Date | null; previstaConsegna: Date | null }[], today: Date): WeekRecapRow[] {
  const map = new Map<string, WeekRecapRow>();
  for (const o of orders) {
    const ref = orderRefDate(o);
    const w = ref ? isoWeek(ref) : null;
    const key = w ? `${w.year}-W${String(w.week).padStart(2, "0")}` : "nd";
    let row = map.get(key);
    if (!row) {
      row = { key, year: w?.year ?? null, week: w?.week ?? null, monday: w?.monday ?? null, sunday: w?.sunday ?? null, ritirati: 0, fissati: 0, inArrivo: 0, totale: 0 };
      map.set(key, row);
    }
    const phase = orderPhase(o, today);
    if (phase === "RITIRATO") row.ritirati++;
    else if (phase === "RITIRO_FISSATO") row.fissati++;
    else row.inArrivo++;
    row.totale++;
  }
  // settimane in ordine cronologico, "senza data" in fondo
  return [...map.values()].sort((a, b) => (a.key === "nd" ? 1 : b.key === "nd" ? -1 : a.key.localeCompare(b.key)));
}

/** Oggi (fuso Europe/Rome) a mezzanotte UTC, confrontabile con le date degli ordini. */
export function todayRome(now = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
