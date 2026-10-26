/**
 * Centri autorizzati Ayvens (officine/carrozzerie per veicoli commerciali):
 * lettura del file "Lista Centri" di Ayvens e gli stessi filtri del suo Excel
 * (tendine multi-selezione a cascata + caselle "Si"). Logica pura, testata in
 * tests/officine.test.ts; usata sia dalla pagina sia dall'export Excel.
 */

export type Centro = {
  ragioneSociale: string;
  regione: string;
  localita: string;
  provincia: string;
  indirizzo: string;
  officina: boolean;
  carrozzeria: boolean;
  rete: string; // marchio della rete ufficiale (Fiat, Ford, …) oppure "Nessuno"
  tuttiBrand: boolean;
  transit: boolean;
};

/** Tendine multi-selezione, nell'ordine dell'Excel. */
export const MULTI_FIELDS = ["ragioneSociale", "regione", "localita", "provincia", "rete"] as const;
export type MultiField = (typeof MULTI_FIELDS)[number];

/** Caselle "Si": spuntata = mostra solo i centri con quel servizio; vuota = tutti. */
export const FLAG_FIELDS = ["officina", "carrozzeria", "tuttiBrand", "transit"] as const;
export type FlagField = (typeof FLAG_FIELDS)[number];

export type Filtri = Record<MultiField, string[]> & Record<FlagField, boolean>;

export const LABELS: Record<MultiField | FlagField | "indirizzo", string> = {
  ragioneSociale: "Ragione Sociale",
  regione: "Regione",
  localita: "Località",
  provincia: "Provincia",
  indirizzo: "Indirizzo",
  officina: "Officina",
  carrozzeria: "Carrozzeria",
  rete: "Rete Assistenza ufficiale",
  tuttiBrand: "Assistenza su tutti i brand",
  transit: "Transit Center (Ford)",
};

/** Come all'apertura dell'Excel: solo la casella Officina è spuntata. */
export const DEFAULT_FILTRI: Filtri = {
  ragioneSociale: [],
  regione: [],
  localita: [],
  provincia: [],
  rete: [],
  officina: true,
  carrozzeria: false,
  tuttiBrand: false,
  transit: false,
};

export const EMPTY_FILTRI: Filtri = { ...DEFAULT_FILTRI, officina: false };

/** Provincia di ciascuna nostra station, per le scorciatoie "vicino alla station". */
export const STATION_PROVINCE: { station: string; provincia: string }[] = [
  { station: "DER1", provincia: "Bologna" },
  { station: "GLS", provincia: "Bologna" },
  { station: "DER2", provincia: "Rimini" },
  { station: "DLO2", provincia: "Varese" },
  { station: "DLO4", provincia: "Milano" },
  { station: "DLO5", provincia: "Brescia" },
  { station: "DLZ2", provincia: "Roma" },
  { station: "DVN1", provincia: "Padova" },
];

// ---------------------------------------------------------------- lettura file

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Testo ripulito: spazi in testa/coda e doppi spazi interni (nel file Ayvens sono frequenti). */
export function clean(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
}

const HEADERS: Record<keyof Centro, string[]> = {
  ragioneSociale: ["ragionesociale"],
  regione: ["regione"],
  localita: ["localita"],
  provincia: ["provincia"],
  indirizzo: ["indirizzo"],
  officina: ["officina"],
  carrozzeria: ["carrozzeria"],
  rete: ["reteassistenzaufficiale"],
  tuttiBrand: ["assistenzasututtiibrand"],
  transit: ["transitcenterford", "transitcenter"],
};

/**
 * Righe del foglio (valori grezzi, qualsiasi riga di partenza) → centri.
 * Cerca la riga d'intestazione della tabella (quella con "Ragione Sociale"
 * e tutte le altre colonne) e legge le righe sotto finché non sono vuote.
 */
export function parseCentri(sheet: unknown[][]): Centro[] {
  // nel file c'è anche l'etichetta "Ragione Sociale" del pannello filtri:
  // l'intestazione vera è la riga che ha anche Regione e Provincia
  const headerIdx = sheet.findIndex((r) => {
    const cells = r.map((c) => norm(clean(c)));
    return cells.includes("ragionesociale") && cells.includes("regione") && cells.includes("provincia");
  });
  if (headerIdx < 0) throw new Error("Intestazione \"Ragione Sociale\" non trovata: è il file Lista Centri di Ayvens?");
  const header = sheet[headerIdx].map((c) => norm(clean(c)));
  const col = {} as Record<keyof Centro, number>;
  for (const [key, names] of Object.entries(HEADERS) as [keyof Centro, string[]][]) {
    const i = header.findIndex((h) => names.includes(h));
    if (i < 0) throw new Error(`Colonna "${LABELS[key]}" non trovata nel file`);
    col[key] = i;
  }
  const yes = (v: unknown) => /^s[iì]$/i.test(clean(v));
  const out: Centro[] = [];
  for (const r of sheet.slice(headerIdx + 1)) {
    const ragioneSociale = clean(r[col.ragioneSociale]);
    if (!ragioneSociale) continue;
    out.push({
      ragioneSociale,
      regione: clean(r[col.regione]),
      localita: clean(r[col.localita]),
      provincia: clean(r[col.provincia]),
      indirizzo: clean(r[col.indirizzo]),
      officina: yes(r[col.officina]),
      carrozzeria: yes(r[col.carrozzeria]),
      rete: clean(r[col.rete]) || "Nessuno",
      tuttiBrand: yes(r[col.tuttiBrand]),
      transit: yes(r[col.transit]),
    });
  }
  if (out.length === 0) throw new Error("Nessun centro trovato sotto l'intestazione");
  return out;
}

// ---------------------------------------------------------------- filtri

const same = (a: string, b: string) => a.localeCompare(b, "it", { sensitivity: "base" }) === 0;

/** La riga passa tutti i filtri, escluso eventualmente `skip` (serve per la cascata). */
export function matches(c: Centro, f: Filtri, skip?: MultiField): boolean {
  for (const k of MULTI_FIELDS) {
    if (k === skip || f[k].length === 0) continue;
    if (!f[k].some((v) => same(v, c[k]))) return false;
  }
  for (const k of FLAG_FIELDS) if (f[k] && !c[k]) return false;
  return true;
}

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

/** Ordine dell'Excel: Regione, Provincia, Località, Ragione Sociale. */
export function sortCentri(rows: Centro[]): Centro[] {
  return [...rows].sort(
    (a, b) =>
      collator.compare(a.regione, b.regione) ||
      collator.compare(a.provincia, b.provincia) ||
      collator.compare(a.localita, b.localita) ||
      collator.compare(a.ragioneSociale, b.ragioneSociale) ||
      collator.compare(a.rete, b.rete),
  );
}

export function applyFiltri(rows: Centro[], f: Filtri): Centro[] {
  return sortCentri(rows.filter((c) => matches(c, f)));
}

export type Option = { value: string; count: number };

/**
 * Valori disponibili per ogni tendina: quelli presenti nelle righe che passano
 * tutti gli ALTRI filtri (così si può aggiungere una seconda regione), con il
 * numero di righe. Ordinati A→Z.
 */
export function facetOptions(rows: Centro[], f: Filtri): Record<MultiField, Option[]> {
  const out = {} as Record<MultiField, Option[]>;
  for (const k of MULTI_FIELDS) {
    const counts = new Map<string, Option>();
    for (const c of rows) {
      if (!matches(c, f, k)) continue;
      const key = c[k].toLowerCase();
      const o = counts.get(key);
      if (o) o.count++;
      else counts.set(key, { value: c[k], count: 1 });
    }
    out[k] = [...counts.values()].sort((a, b) => collator.compare(a.value, b.value));
  }
  return out;
}

/**
 * Toglie le scelte non più compatibili con gli altri filtri (come fa la macro
 * dell'Excel): ripete finché la selezione è stabile.
 */
export function pruneFiltri(rows: Centro[], f: Filtri): Filtri {
  let cur = f;
  for (let guard = 0; guard < 5; guard++) {
    const opts = facetOptions(rows, cur);
    let changed = false;
    const next = { ...cur };
    for (const k of MULTI_FIELDS) {
      const kept = cur[k].filter((v) => opts[k].some((o) => same(o.value, v)));
      if (kept.length !== cur[k].length) {
        next[k] = kept;
        changed = true;
      }
    }
    if (!changed) return cur;
    cur = next;
  }
  return cur;
}

/** Aggiunge o toglie un valore da una tendina multi-selezione (come MergeChoices della macro). */
export function toggleValue(list: string[], value: string): string[] {
  return list.some((v) => same(v, value)) ? list.filter((v) => !same(v, value)) : [...list, value];
}

/** Centri unici (una riga del file è un centro + un marchio). */
export function countCentri(rows: Centro[]): number {
  return new Set(rows.map((c) => `${c.ragioneSociale}|${c.indirizzo}|${c.localita}`.toLowerCase())).size;
}

// ---------------------------------------------------------------- URL

const PARAM: Record<MultiField | FlagField, string> = {
  ragioneSociale: "ragione",
  regione: "regione",
  localita: "localita",
  provincia: "provincia",
  rete: "rete",
  officina: "officina",
  carrozzeria: "carrozzeria",
  tuttiBrand: "tuttibrand",
  transit: "transit",
};

/** Filtri → query string (solo ciò che differisce dai default). */
export function filtriToParams(f: Filtri): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of MULTI_FIELDS) for (const v of f[k]) p.append(PARAM[k], v);
  for (const k of FLAG_FIELDS) if (f[k] !== DEFAULT_FILTRI[k]) p.set(PARAM[k], f[k] ? "1" : "0");
  return p;
}

export function filtriFromParams(p: URLSearchParams): Filtri {
  const f = { ...DEFAULT_FILTRI };
  for (const k of MULTI_FIELDS) f[k] = p.getAll(PARAM[k]).map(clean).filter(Boolean);
  for (const k of FLAG_FIELDS) {
    const v = p.get(PARAM[k]);
    if (v === "1") f[k] = true;
    else if (v === "0") f[k] = false;
  }
  return f;
}

/** Descrizione leggibile dei filtri attivi (foglio "Filtri" dell'export). */
export function describeFiltri(f: Filtri): [string, string][] {
  const out: [string, string][] = [];
  for (const k of MULTI_FIELDS) out.push([LABELS[k], f[k].length ? f[k].join(", ") : "Tutti"]);
  for (const k of FLAG_FIELDS) out.push([LABELS[k], f[k] ? "Solo Si" : "Tutti"]);
  return out;
}
