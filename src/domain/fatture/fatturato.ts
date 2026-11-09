/**
 * Fatturato (SPEC §6): somme di AVERE (netto) per mese/settimana × DS / classe.
 * Attribuzione temporale = data della riga (giorno di servizio), come le
 * colonne MESE/ANNO di fatt_2026, non la data fattura.
 */
import { CLASSI, isRotta } from "./classifica";

export type RigaFatturato = { ds: string; anno: number; mese: number; week: number; classe: string; avere: number; quantita: number; /** giorno di servizio AAAA-MM-GG: serve a contare il same day come il forecast */ data?: string };

/** Station sempre in tabella (anche a zero), nell'ordine del file. */
export const DS_FATTURATO = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"];

/** Codici Amazon che sono rotte extra fatte da un'altra station: DVN5 e DVN6 sono di DVN1 (fatture e forecast). */
export const DS_ACCORPATE: Record<string, string> = { DVN5: "DVN1", DVN6: "DVN1" };
/** Station a cui va il fatturato / il forecast di un codice Amazon. */
export const dsAmazon = (ds: string) => DS_ACCORPATE[ds.trim().toUpperCase()] ?? ds;
/** Codici da cercare nei dati per una station (DVN1 → DVN1, DVN5, DVN6). */
export const codiciDs = (ds: string) => [ds, ...Object.entries(DS_ACCORPATE).filter(([, a]) => a === ds).map(([k]) => k)];

const r2 = (x: number) => Math.round(x * 100) / 100;

export type Griglia = { righe: (string | number)[]; colonne: string[]; valori: Record<string, Record<string, number>>; totRiga: Record<string, number>; totCol: Record<string, number>; totale: number };

function griglia<R extends string | number>(righe: RigaFatturato[], riga: (r: RigaFatturato) => R, colonna: (r: RigaFatturato) => string, colonneFisse: string[], righeFisse?: R[]): Griglia {
  const valori: Record<string, Record<string, number>> = {};
  const cols = new Set(colonneFisse);
  const rs = new Set<R>(righeFisse ?? []);
  for (const r of righe) {
    const k = String(riga(r)), c = colonna(r);
    rs.add(riga(r));
    cols.add(c);
    valori[k] ??= {};
    valori[k][c] = (valori[k][c] ?? 0) + r.avere;
  }
  const colonne = [...cols];
  const ordRighe = [...rs].sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))));
  const totRiga: Record<string, number> = {}, totCol: Record<string, number> = {};
  let totale = 0;
  for (const k of ordRighe.map(String)) {
    valori[k] ??= {};
    for (const c of colonne) {
      const v = r2(valori[k][c] ?? 0);
      valori[k][c] = v;
      totRiga[k] = (totRiga[k] ?? 0) + v;
      totCol[c] = (totCol[c] ?? 0) + v;
      totale += v;
    }
    totRiga[k] = r2(totRiga[k] ?? 0);
  }
  for (const c of colonne) totCol[c] = r2(totCol[c] ?? 0);
  return { righe: ordRighe, colonne, valori, totRiga, totCol, totale: r2(totale) };
}

const mesiFinoA = (righe: RigaFatturato[]) => Array.from({ length: Math.max(0, ...righe.map((r) => r.mese)) }, (_, i) => i + 1);

/** Mese × DS dell'anno. */
export const meseDs = (righe: RigaFatturato[], anno: number, ds = DS_FATTURATO) => {
  const r = righe.filter((x) => x.anno === anno);
  return griglia(r, (x) => x.mese, (x) => x.ds, ds, mesiFinoA(r));
};

/** Mese × classe dell'anno (tutte le classi, anche a zero). */
export const meseClasse = (righe: RigaFatturato[], anno: number) => {
  const r = righe.filter((x) => x.anno === anno);
  return griglia(r, (x) => x.mese, (x) => x.classe, [...CLASSI].sort(), mesiFinoA(r));
};

/** Settimana Amazon × DS dell'anno. */
export const settimanaDs = (righe: RigaFatturato[], anno: number, ds = DS_FATTURATO) => griglia(righe.filter((x) => x.anno === anno), (x) => x.week, (x) => x.ds, ds);

export type IndicatoriDs = {
  ds: string;
  rotteND: number; avereND: number; euroND: number | null;
  rotteSD: number; avereSD: number; euroSD: number | null;
  rotte: number; avereRotte: number; euroPerRotta: number | null;
  avereExtra: number; extraPerRotta: number | null;
  avere: number; euroTotalePerRotta: number | null;
};

/**
 * Per DS: rotte e € next (classi ND_*, SWA/MFN comprese) e same day (classi SD_*), contate come il forecast:
 * same day di ogni giorno = A + il maggiore tra B e C (B e C le fa lo stesso furgone). Extra = classi EXTRA_*.
 * € per rotta totale = AVERE totale (rotte + extra) / rotte.
 */
export function indicatoriDs(righe: RigaFatturato[], filtro: (r: RigaFatturato) => boolean = () => true, ds = DS_FATTURATO): IndicatoriDs[] {
  type Acc = { rotteND: number; avereND: number; avereSD: number; avereExtra: number; sd: Map<string, { a: number; b: number; c: number }> };
  const nuovo = (): Acc => ({ rotteND: 0, avereND: 0, avereSD: 0, avereExtra: 0, sd: new Map() });
  const m = new Map<string, Acc>(ds.map((d) => [d, nuovo()]));
  for (const r of righe.filter(filtro)) {
    const x = m.get(r.ds) ?? nuovo(); m.set(r.ds, x);
    if (r.classe.startsWith("ND_")) { x.rotteND += r.quantita; x.avereND += r.avere; }
    else if (r.classe.startsWith("SD_")) {
      x.avereSD += r.avere;
      const k = r.data ?? `${r.anno}-${r.mese}-${r.week}`;
      const g = x.sd.get(k) ?? { a: 0, b: 0, c: 0 };
      if (r.classe === "SD_B") g.b += r.quantita; else if (r.classe === "SD_C") g.c += r.quantita; else g.a += r.quantita;
      x.sd.set(k, g);
    } else x.avereExtra += r.avere;
  }
  const div = (a: number, b: number) => (b ? r2(a / b) : null);
  return [...m.entries()].map(([d, x]) => {
    const rotteSD = [...x.sd.values()].reduce((s, g) => s + g.a + Math.max(g.b, g.c), 0);
    const rotte = x.rotteND + rotteSD, avereRotte = x.avereND + x.avereSD, avere = avereRotte + x.avereExtra;
    return {
      ds: d, rotteND: x.rotteND, avereND: r2(x.avereND), euroND: div(x.avereND, x.rotteND),
      rotteSD, avereSD: r2(x.avereSD), euroSD: div(x.avereSD, rotteSD),
      rotte, avereRotte: r2(avereRotte), euroPerRotta: div(avereRotte, rotte),
      avereExtra: r2(x.avereExtra), extraPerRotta: div(x.avereExtra, rotte),
      avere: r2(avere), euroTotalePerRotta: div(avere, rotte),
    };
  });
}
