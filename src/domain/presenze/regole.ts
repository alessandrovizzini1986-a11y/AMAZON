/**
 * Regole e costanti dei controlli presenze (station, soglie, giustificativi,
 * normalizzazione nomi). Fonte: kit docs/presenze-kit (regole/ e riferimento/).
 */
export const STATIONS = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"] as const;
export type Station = (typeof STATIONS)[number];

/** Città nei nomi file Zucchetti → station */
export const CITTA: Record<string, Station> = {
  VALSAMOGGIA: "DER1",
  SANTARCANGELO: "DER2",
  ORIGGIO: "DLO2",
  BUCCINASCO: "DLO4",
  CASTEGNATO: "DLO5",
  POMEZIA: "DLZ2",
  VIGONZA: "DVN1",
};

export const SOGLIA_PACCHI = 10; // rotta Amazon = pacchi consegnati > 10
export const SOGLIA_ORE = 4; // trasferta dovuta se ore lavorate > 4
export const IND_EUR = 22.5; // indennità di trasferta giornaliera

/** Giustificativi della riga RIPOSO (regole/giustificativi.csv): chiudono il giorno senza alert. */
export const GIUSTIFICATIVI_DEFAULT: { codice: string; descrizione: string }[] = [
  { codice: "MEZZI", descrizione: "spostamento mezzi" },
  { codice: "SM", descrizione: "spostamento mezzi" },
  { codice: "UFF", descrizione: "ufficio" },
  { codice: "UFFICIO", descrizione: "ufficio" },
  { codice: "CORSO", descrizione: "formazione" },
  { codice: "FORMAZIONE", descrizione: "formazione" },
  { codice: "RESCUE", descrizione: "rescue (trasferta dovuta)" },
  { codice: "VM", descrizione: "visita medica" },
  { codice: "DVN5", descrizione: "prestito altra station" },
  { codice: "DVN6", descrizione: "prestito altra station" },
  ...STATIONS.map((s) => ({ codice: s, descrizione: "prestito altra station" })),
  ...Object.keys(CITTA).map((c) => ({ codice: c, descrizione: "prestito altra station" })),
];

/** Codici che NON sono giustificativi (turni/riposi), riportati in nota. */
export const NON_GIUSTIFICATIVI = ["SB", "L1", "R", "C1", "D", "F", "P"];

/**
 * Regole dello script v2 (base del test golden): mansioni non di guida e
 * prestiti ad altra station, più RESCUE.
 */
export const NONGUIDA_V2 = new Set(["MEZZI", "SM", "UFF", "UFFICIO", "CORSO", "FORMAZIONE", "MAGAZZINO", "OFFICINA"]);
export const ALTRADS_V2 = /^(D[A-Z]{2}\d|ORIGGIO|BUCCINASCO|VALSAMOGGIA|SANTARCANGELO|CASTEGNATO|POMEZIA|VIGONZA)$/;

/** ID Amazon validi (gli script ignorano 0, -, NA, X, vuoto). */
export function okId(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s === "") return false;
  return !["0", "-", "NA", "N/A", "NESSUNO", "X"].includes(s.toUpperCase());
}

/**
 * Nome normalizzato come lo script v2: minuscolo, solo lettere a-z, parole
 * ordinate (ordine cognome/nome indifferente). Prima toglie accenti e
 * apostrofi, così "D'Andrea" = "Dandrea" e "Niccolò" = "Niccolo".
 */
export function normName(s: unknown): string {
  const t = String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z ]/g, " ");
  return t.split(/\s+/).filter(Boolean).sort().join(" ");
}

/** Station citata nel nome file (DER1, DLO2, …). */
export function stationFromName(fileName: string): Station | null {
  const up = fileName.toUpperCase();
  return STATIONS.find((s) => up.includes(s)) ?? null;
}
