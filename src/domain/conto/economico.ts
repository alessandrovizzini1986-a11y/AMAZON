/**
 * Conto economico per cliente (Amazon CDC 5569, GLS CDC 5565) e mese, con quello che il sito sa:
 *  - ricavi Amazon = imponibile (AVERE) delle righe di fattura del mese; GLS = fattura open book stimata;
 *  - personale = consuntivo (ADIT / payroll riconciliati) se c'è, altrimenti la stima salvata;
 *  - mezzi = canoni dei mezzi nella station, pro-rata ai giorni (sostitutivi esclusi);
 *  - carburante e pedaggi = elaborazioni Q8 e Telepass del mese, o il consuntivo contabile se c'è;
 *  - parcheggi = Parametri PARCHEGGIO_<DS>.
 * Puro: i numeri arrivano già aggregati per mese e station.
 */
export const VOCI_COSTO = ["personale", "mezzi", "carburante", "pedaggi", "parcheggi", "altri"] as const;
export type VoceCosto = (typeof VOCI_COSTO)[number];
export type Fonte = { valore: number | null; fonte: string };
export type RigaConto = { chiave: string; ricavi: Fonte; costi: Record<VoceCosto, Fonte>; totaleCosti: number; margine: number | null; marginePct: number | null };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function rigaConto(chiave: string, ricavi: Fonte, costi: Record<VoceCosto, Fonte>): RigaConto {
  const totaleCosti = r2(VOCI_COSTO.reduce((a, v) => a + (costi[v].valore ?? 0), 0));
  const margine = ricavi.valore === null ? null : r2(ricavi.valore - totaleCosti);
  return { chiave, ricavi, costi, totaleCosti, margine, marginePct: margine === null || !ricavi.valore ? null : Math.round((margine / ricavi.valore) * 1000) / 10 };
}

/** Somma più righe (es. le DS di Amazon) in una. */
export function sommaRighe(chiave: string, righe: RigaConto[]): RigaConto {
  const s = (f: Fonte[]) => ({ valore: f.every((x) => x.valore === null) ? null : r2(f.reduce((a, x) => a + (x.valore ?? 0), 0)), fonte: [...new Set(f.map((x) => x.fonte).filter(Boolean))].join("; ") });
  const costi = Object.fromEntries(VOCI_COSTO.map((v) => [v, s(righe.map((r) => r.costi[v]))])) as Record<VoceCosto, Fonte>;
  return rigaConto(chiave, s(righe.map((r) => r.ricavi)), costi);
}

/** Giorni del mese AAAA-MM in cui un intervallo [da, a] (a = null: aperto) è dentro il mese. */
export function giorniNelMese(mese: string, da: string, a: string | null): number {
  const [y, m] = mese.split("-").map(Number);
  const inizio = Date.UTC(y, m - 1, 1), fine = Date.UTC(y, m, 0);
  const d1 = Math.max(inizio, Date.parse(`${da.slice(0, 10)}T00:00:00Z`)), d2 = Math.min(fine, a ? Date.parse(`${a.slice(0, 10)}T00:00:00Z`) : fine);
  return d2 < d1 ? 0 : Math.round((d2 - d1) / 86400000) + 1;
}

export type PeriodoMezzo = { station: string; da: string; a: string | null; canone: number; sostitutivo: boolean };
/** Canoni del mese per station, pro-rata ai giorni passati in quella station. */
export function canoniMese(mese: string, periodi: PeriodoMezzo[]): Record<string, number> {
  const [y, m] = mese.split("-").map(Number);
  const gg = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: Record<string, number> = {};
  for (const p of periodi) {
    if (p.sostitutivo || !(p.canone > 0)) continue;
    const g = giorniNelMese(mese, p.da, p.a);
    if (g > 0) out[p.station] = r2((out[p.station] ?? 0) + (p.canone * g) / gg);
  }
  return out;
}

/** Costi GLS salvati dalla pagina Costi GLS (popolazione "GLS"). */
export type CostiGlsMese = { bustaSic: number; accStraord: number; accFerie: number; std: number; teste: number; danni: number; altri: number };
export const VOCI_GLS = { bustaSic: "BUSTA_SIC", accStraord: "ACC_STRAORD", accFerie: "ACC_FERIE", std: "STD", teste: "TESTE", danni: "DANNI", altri: "ALTRI" } as const;

/** Costo del lavoro GLS di competenza (P60 + P61 del F.O.): busta − accantonamenti del mese prima + accantonamenti del mese + STD. */
export function lavoroGls(m: CostiGlsMese, prec: CostiGlsMese | null) {
  return r2(m.bustaSic - (prec ? prec.accStraord + prec.accFerie : 0) + m.accStraord + m.accFerie + m.std);
}

export const OPEN_BOOK = { accessoriPerTesta: 129.25, attrezzaturePerTesta: 37.42, struttura: 0.07, margine: 0.065 };

/**
 * Fattura open book GLS del mese M (foglio MMAA_ft): lavoro, mezzi e carburante del mese prima, pedaggi di due mesi prima,
 * + teste attive del mese × (129,25 + 37,42), + 7 % di struttura, + 6,5 % di margine. null se manca il costo del lavoro.
 */
export function fatturaOpenBook(x: { lavoroPrec: number | null; mezziPrec: number; carburantePrec: number; pedaggiPrec2: number; teste: number }) {
  if (x.lavoroPrec === null) return null;
  const base = x.lavoroPrec + x.mezziPrec + x.carburantePrec + x.pedaggiPrec2 + x.teste * (OPEN_BOOK.accessoriPerTesta + OPEN_BOOK.attrezzaturePerTesta);
  const conStruttura = base * (1 + OPEN_BOOK.struttura);
  return r2(conStruttura * (1 + OPEN_BOOK.margine));
}
